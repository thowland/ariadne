import type { IsoDate } from '../types';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse an IsoDate at local midnight. Throws on malformed input. */
function atLocalMidnight(iso: IsoDate): Date {
  if (!ISO_DATE_RE.test(iso)) {
    throw new Error(`Invalid ISO date: "${iso}"`);
  }
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid ISO date: "${iso}"`);
  }
  return d;
}

export function isValidIsoDate(value: string): value is IsoDate {
  if (!ISO_DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  // A NaN check alone is not enough: V8 rolls an out-of-range day forward
  // rather than rejecting it, so "2026-02-30" parses as March 2. Round-trip
  // the components to catch a day that does not exist in its month.
  return toIsoDate(d) === value;
}

/** Format a Date as a local-timezone IsoDate. */
export function toIsoDate(d: Date): IsoDate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Add `n` calendar days (may be negative). */
export function isoAdd(iso: IsoDate, n: number): IsoDate {
  const d = atLocalMidnight(iso);
  d.setDate(d.getDate() + n);
  return toIsoDate(d);
}

/**
 * Whole-day difference `a - b`. Rounded so DST transitions between the two
 * dates cannot skew the count (matches the prototype's dDiff).
 */
export function dayDiff(a: IsoDate, b: IsoDate): number {
  return Math.round((atLocalMidnight(a).getTime() - atLocalMidnight(b).getTime()) / 86_400_000);
}

/** e.g. "Jul 8". Empty string for null/undefined, matching prototype fmtShort. */
export function fmtShort(iso: IsoDate | null | undefined): string {
  if (!iso) return '';
  return atLocalMidnight(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** e.g. "Wednesday, July 8, 2026". */
export function fmtLong(iso: IsoDate): string {
  return atLocalMidnight(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/** The `YYYY-MM` month key containing the date (calendar paging). */
export function monthKey(iso: IsoDate): string {
  return iso.slice(0, 7);
}

/** Day of week, 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(iso: IsoDate): number {
  return atLocalMidnight(iso).getDay();
}

/** The Sunday starting the week containing `iso` (weeks run Sun–Sat, D15). */
export function weekStart(iso: IsoDate): IsoDate {
  return isoAdd(iso, -dayOfWeek(iso));
}

/** The Saturday ending the week containing `iso`. */
export function weekEnd(iso: IsoDate): IsoDate {
  return isoAdd(iso, 6 - dayOfWeek(iso));
}
