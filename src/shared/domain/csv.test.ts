import { describe, expect, it } from 'vitest';

import { parseCsv, toCsv, unguardCsvCell } from './csv';

describe('parseCsv', () => {
  it('parses plain rows', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('handles quoted cells with commas and escaped quotes', () => {
    expect(parseCsv('"hello, world",plain\n"say ""hi""",x')).toEqual([
      ['hello, world', 'plain'],
      ['say "hi"', 'x'],
    ]);
  });

  it('handles CRLF line endings and skips empty lines', () => {
    expect(parseCsv('a,b\r\n\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps empty cells', () => {
    expect(parseCsv('a,,c\n,,')).toEqual([
      ['a', '', 'c'],
      ['', '', ''],
    ]);
  });

  it('returns an empty array for empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });
});

describe('toCsv', () => {
  it('quotes only the cells that need it', () => {
    expect(
      toCsv([
        ['a', 'b'],
        ['plain', 'has,comma'],
      ]),
    ).toBe('a,b\r\nplain,"has,comma"\r\n');
  });

  it('doubles embedded quotes and quotes cells containing newlines', () => {
    expect(toCsv([['say "hi"']])).toBe('"say ""hi"""\r\n');
    expect(toCsv([['two\nlines']])).toBe('"two\nlines"\r\n');
  });

  it('neutralises formula injection in leading =, +, - and @', () => {
    // A project named =cmd|'/c calc' must reach a spreadsheet as text.
    expect(toCsv([['=1+1', '+x', '-y', '@z']])).toBe("'=1+1,'+x,'-y,'@z\r\n");
  });

  it('round-trips through parseCsv', () => {
    const rows = [
      ['Project', 'Next due'],
      ['Comma, Inc', '2026-07-08'],
      ['Quote "Q"', ''],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it('ends with a newline so the last row is terminated', () => {
    expect(toCsv([['a']]).endsWith('\r\n')).toBe(true);
  });
});

describe('parseCsv — RFC-4180 edges', () => {
  it('round-trips its own output, newlines in a cell included', () => {
    const rows = [
      ['Name', 'Notes'],
      ['Dana Reyes', 'Prefers a call.\nSecond line, with a comma.'],
      ['Tom "Woody" Whitaker', 'Quoted "nickname" inside'],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it('accepts CRLF, LF, and a missing final newline alike', () => {
    expect(parseCsv('a,b\r\nc,d\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(parseCsv('a,b\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('keeps a row of empty cells but drops a blank line', () => {
    expect(parseCsv('a,b\n\n,\n')).toEqual([
      ['a', 'b'],
      ['', ''],
    ]);
    expect(parseCsv('')).toEqual([]);
  });
});

describe('unguardCsvCell', () => {
  it('strips the formula guard toCsv added', () => {
    // A phone number is the case that bites: every international number
    // starts with the "+" that the guard escapes.
    expect(unguardCsvCell("'+1 555 010 0000")).toBe('+1 555 010 0000');
    expect(unguardCsvCell("'=SUM(A1)")).toBe('=SUM(A1)');
    expect(toCsv([['+1 555 010 0000']]).trim()).toBe("'+1 555 010 0000");
  });

  it('leaves an apostrophe that is part of the value alone', () => {
    expect(unguardCsvCell("O'Brien")).toBe("O'Brien");
    expect(unguardCsvCell("'quoted'")).toBe("'quoted'");
    expect(unguardCsvCell('')).toBe('');
  });
});
