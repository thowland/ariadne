import { describe, expect, it } from 'vitest';

import { parseCsv, toCsv } from './csv';

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
