import { describe, expect, it } from 'vitest';

import { todayIso } from './clock';

describe('todayIso', () => {
  it('formats the provided instant as a local ISO date', () => {
    expect(todayIso(undefined, new Date(2026, 6, 8, 15, 30))).toBe('2026-07-08');
    expect(todayIso(undefined, new Date(2026, 0, 1, 0, 0, 1))).toBe('2026-01-01');
  });

  it('honors a valid override (ARIADNE_FAKE_TODAY)', () => {
    expect(todayIso('2026-07-08', new Date(2031, 3, 4))).toBe('2026-07-08');
  });

  it('ignores an invalid or absent override', () => {
    const now = new Date(2026, 6, 8);
    expect(todayIso('yesterday', now)).toBe('2026-07-08');
    expect(todayIso('', now)).toBe('2026-07-08');
    expect(todayIso(undefined, now)).toBe('2026-07-08');
  });

  it('defaults to the real current date', () => {
    // Just structural sanity — the real value changes every day.
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
