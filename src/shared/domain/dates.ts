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
  return !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
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
