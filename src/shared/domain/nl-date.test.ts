import { describe, expect, it } from 'vitest';

import { findNlDate } from './nl-date';

// A Wednesday, matching the rest of the suite.
const TODAY = '2026-07-08';

/** The resolved date for `text`, or null. */
function on(text: string, today = TODAY): string | null {
  return findNlDate(text, today)?.date ?? null;
}

describe('findNlDate', () => {
  it('resolves today and tomorrow, long and short', () => {
    expect(on('ship it today')).toBe('2026-07-08');
    expect(on('ship it tod')).toBe('2026-07-08');
    expect(on('call Bob tomorrow')).toBe('2026-07-09');
    expect(on('call Bob tom')).toBe('2026-07-09');
    expect(on('call Bob tmrw')).toBe('2026-07-09');
  });

  it('resolves weekday names and their abbreviations', () => {
    // Today is Wednesday 2026-07-08.
    expect(on('standup thursday')).toBe('2026-07-09');
    expect(on('standup thurs')).toBe('2026-07-09');
    expect(on('standup thu')).toBe('2026-07-09');
    expect(on('review friday')).toBe('2026-07-10');
    expect(on('review fri')).toBe('2026-07-10');
    expect(on('retro monday')).toBe('2026-07-13');
    expect(on('retro mon')).toBe('2026-07-13');
    expect(on('sync tues')).toBe('2026-07-14');
    expect(on('sync weds')).toBe('2026-07-15');
  });

  it('reads the current weekday as a week out, not this morning', () => {
    // Wednesday on a Wednesday means next Wednesday: today has already gone.
    expect(on('planning wednesday')).toBe('2026-07-15');
    expect(on('planning weds')).toBe('2026-07-15');
  });

  it('treats "next <weekday>" the same as the bare weekday', () => {
    expect(on('retro next monday')).toBe('2026-07-13');
    expect(on('retro next friday')).toBe('2026-07-10');
  });

  it('handles relative spans', () => {
    expect(on('follow up in 3 days')).toBe('2026-07-11');
    expect(on('follow up in 1 day')).toBe('2026-07-09');
    expect(on('follow up in 2 weeks')).toBe('2026-07-22');
    expect(on('check next week')).toBe('2026-07-15');
  });

  it('handles month-and-day in either order, with ordinals', () => {
    expect(on('invoice aug 5')).toBe('2026-08-05');
    expect(on('invoice August 5th')).toBe('2026-08-05');
    expect(on('invoice 5 aug')).toBe('2026-08-05');
    expect(on('invoice 23rd december')).toBe('2026-12-23');
  });

  it('lands Feb 29 on the next leap year', () => {
    // 2027 is not a leap year; 2028 is.
    expect(on('leap feb 29', '2027-03-01')).toBe('2028-02-29');
  });

  it('rolls a past month-day into next year', () => {
    // January has already gone by July.
    expect(on('taxes jan 15')).toBe('2027-01-15');
    // A date still ahead this year stays this year.
    expect(on('taxes dec 15')).toBe('2026-12-15');
  });

  it('accepts a literal ISO date', () => {
    expect(on('cutover 2026-09-01')).toBe('2026-09-01');
  });

  it('reports where the phrase sits so the caller can highlight it', () => {
    const m = findNlDate('call Bob tomorrow', TODAY);
    expect(m).not.toBeNull();
    expect(m?.text).toBe('tomorrow');
    expect('call Bob tomorrow'.slice(m!.start, m!.end)).toBe('tomorrow');
  });

  it('preserves the user’s capitalisation in the matched text', () => {
    expect(findNlDate('Ship Friday', TODAY)?.text).toBe('Friday');
  });

  it('takes the earliest phrase when a title holds more than one', () => {
    // Picking the later one would silently disagree with what reads first.
    expect(on('call Bob tomorrow about friday')).toBe('2026-07-09');
  });

  describe('does not fire on things that are not dates', () => {
    it('ignores words that merely contain a weekday abbreviation', () => {
      // The whole reason every rule is \b-anchored.
      expect(on('satisfy the auditor')).toBeNull();
      expect(on('monitor disk usage')).toBeNull();
      expect(on('wedge the door')).toBeNull();
      expect(on('sunset the old API')).toBeNull();
      expect(on('a frivolous request')).toBeNull();
      expect(on('tomato soup recipe')).toBeNull();
      expect(on('marching orders')).toBeNull();
    });

    it('ignores bare numbers', () => {
      expect(on('call 3')).toBeNull();
      expect(on('upgrade to 5')).toBeNull();
      expect(on('review PR 1234')).toBeNull();
    });

    it('ignores an impossible calendar date', () => {
      expect(on('nope feb 30')).toBeNull();
      expect(on('nope 2026-13-45')).toBeNull();
    });

    it('returns null for a title with no date at all', () => {
      expect(on('')).toBeNull();
      expect(on('Provision new k8s cluster')).toBeNull();
      expect(on('Write migration runbook')).toBeNull();
    });
  });

  it('is stable across the week boundary', () => {
    // From a Sunday, "sunday" is a week out and "monday" is tomorrow.
    const sunday = '2026-07-12';
    expect(on('x sunday', sunday)).toBe('2026-07-19');
    expect(on('x monday', sunday)).toBe('2026-07-13');
    expect(on('x saturday', sunday)).toBe('2026-07-18');
  });
});
