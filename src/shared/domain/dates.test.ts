import { describe, expect, it } from 'vitest';

import {
  dayDiff,
  dayOfWeek,
  fmtLong,
  fmtShort,
  isoAdd,
  isValidIsoDate,
  monthKey,
  toIsoDate,
  weekEnd,
  weekStart,
} from './dates';

// The prototype's pinned demo date; convenient, stable fixture.
const TODAY = '2026-07-08';

describe('isValidIsoDate', () => {
  it('accepts well-formed calendar dates', () => {
    expect(isValidIsoDate('2026-07-08')).toBe(true);
    expect(isValidIsoDate('2000-01-01')).toBe(true);
    expect(isValidIsoDate('1999-12-31')).toBe(true);
  });

  it('rejects days that do not exist in their month', () => {
    // V8 rolls these forward rather than reporting NaN, so a plain
    // Number.isNaN check on the parsed Date accepted them until 1.20.
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('2026-04-31')).toBe(false);
    expect(isValidIsoDate('2027-02-29')).toBe(false); // not a leap year
    expect(isValidIsoDate('2028-02-29')).toBe(true); // leap year
    expect(isValidIsoDate('2026-06-31')).toBe(false);
  });

  it('rejects malformed strings', () => {
    expect(isValidIsoDate('')).toBe(false);
    expect(isValidIsoDate('2026-7-8')).toBe(false);
    expect(isValidIsoDate('07/08/2026')).toBe(false);
    expect(isValidIsoDate('2026-07-08T00:00:00')).toBe(false);
    expect(isValidIsoDate('not a date')).toBe(false);
  });

  it('rejects impossible dates', () => {
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('2026-00-10')).toBe(false);
  });
});

describe('toIsoDate', () => {
  it('formats a local date with zero padding', () => {
    expect(toIsoDate(new Date(2026, 6, 8))).toBe('2026-07-08');
    expect(toIsoDate(new Date(2026, 0, 1))).toBe('2026-01-01');
    expect(toIsoDate(new Date(1999, 11, 31))).toBe('1999-12-31');
  });
});

describe('isoAdd', () => {
  it('adds days', () => {
    expect(isoAdd(TODAY, 1)).toBe('2026-07-09');
    expect(isoAdd(TODAY, 7)).toBe('2026-07-15');
  });

  it('subtracts days', () => {
    expect(isoAdd(TODAY, -1)).toBe('2026-07-07');
    expect(isoAdd(TODAY, -8)).toBe('2026-06-30');
  });

  it('is identity at zero', () => {
    expect(isoAdd(TODAY, 0)).toBe(TODAY);
  });

  it('crosses month and year boundaries', () => {
    expect(isoAdd('2026-07-31', 1)).toBe('2026-08-01');
    expect(isoAdd('2026-12-31', 1)).toBe('2027-01-01');
    expect(isoAdd('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('handles leap years', () => {
    expect(isoAdd('2028-02-28', 1)).toBe('2028-02-29');
    expect(isoAdd('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('throws on malformed input', () => {
    expect(() => isoAdd('garbage', 1)).toThrow(/Invalid ISO date/);
  });
});

describe('dayDiff', () => {
  it('computes signed whole-day differences (a - b)', () => {
    expect(dayDiff('2026-07-09', TODAY)).toBe(1);
    expect(dayDiff('2026-07-01', TODAY)).toBe(-7);
    expect(dayDiff(TODAY, TODAY)).toBe(0);
  });

  it('spans month/year boundaries', () => {
    expect(dayDiff('2027-01-01', '2026-12-31')).toBe(1);
    expect(dayDiff('2026-08-01', '2026-07-08')).toBe(24);
  });

  it('is stable across DST transitions', () => {
    // US spring-forward 2026-03-08 and fall-back 2026-11-01 sit inside these ranges.
    expect(dayDiff('2026-03-10', '2026-03-06')).toBe(4);
    expect(dayDiff('2026-11-03', '2026-10-30')).toBe(4);
  });

  it('throws on malformed input', () => {
    expect(() => dayDiff('nope', TODAY)).toThrow(/Invalid ISO date/);
    expect(() => dayDiff(TODAY, 'nope')).toThrow(/Invalid ISO date/);
  });
});

describe('fmtShort', () => {
  it('renders "Mon D"', () => {
    expect(fmtShort(TODAY)).toBe('Jul 8');
    expect(fmtShort('2026-12-25')).toBe('Dec 25');
  });

  it('returns empty string for missing dates (prototype behavior)', () => {
    expect(fmtShort(null)).toBe('');
    expect(fmtShort(undefined)).toBe('');
  });
});

describe('fmtLong', () => {
  it('renders the full weekday form used in the top bar', () => {
    expect(fmtLong(TODAY)).toBe('Wednesday, July 8, 2026');
  });
});

describe('monthKey', () => {
  it('returns the YYYY-MM prefix', () => {
    expect(monthKey(TODAY)).toBe('2026-07');
    expect(monthKey('1999-12-31')).toBe('1999-12');
  });
});

describe('week boundaries (Sun–Sat, D15)', () => {
  it('dayOfWeek: 0 = Sunday … 6 = Saturday', () => {
    expect(dayOfWeek('2026-07-05')).toBe(0); // Sunday
    expect(dayOfWeek(TODAY)).toBe(3); // Wednesday
    expect(dayOfWeek('2026-07-11')).toBe(6); // Saturday
  });

  it('weekStart/weekEnd bracket the containing week', () => {
    expect(weekStart(TODAY)).toBe('2026-07-05');
    expect(weekEnd(TODAY)).toBe('2026-07-11');
    // Idempotent at the boundaries.
    expect(weekStart('2026-07-05')).toBe('2026-07-05');
    expect(weekEnd('2026-07-11')).toBe('2026-07-11');
    // Crosses month/year edges cleanly.
    expect(weekStart('2026-01-01')).toBe('2025-12-28');
    expect(weekEnd('2026-08-31')).toBe('2026-09-05');
  });
});
