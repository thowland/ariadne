/**
 * Natural-language due dates in task titles (D29).
 *
 * Typing "call Bob tomorrow" should offer Tomorrow's date without making the
 * user leave the title field. This module finds at most one date phrase in a
 * string and resolves it against `today`; the caller decides what to do with
 * it. Pure: no DOM, no clock — `today` is always passed in.
 *
 * Deliberately conservative. A false positive silently changes a due date the
 * user did not ask to change, which is worse than missing a phrase they can
 * set by hand, so this only matches unambiguous vocabulary and never guesses
 * at bare numbers ("call 3" is not "the 3rd").
 */
import type { IsoDate } from '../types';

import { dayOfWeek, isoAdd, isValidIsoDate } from './dates';

export interface NlDateMatch {
  /** The resolved due date. */
  date: IsoDate;
  /** Index of the first matched character in the source string. */
  start: number;
  /** Index one past the last matched character. */
  end: number;
  /** The matched text, exactly as the user typed it. */
  text: string;
}

/** Weekday names and their abbreviations, longest-first within each day. */
const WEEKDAYS: readonly (readonly [number, readonly string[]])[] = [
  [0, ['sunday', 'sun']],
  [1, ['monday', 'mon']],
  [2, ['tuesday', 'tues', 'tue']],
  [3, ['wednesday', 'weds', 'wed']],
  [4, ['thursday', 'thurs', 'thur', 'thu']],
  [5, ['friday', 'fri']],
  [6, ['saturday', 'sat']],
];

const MONTHS: readonly (readonly [number, readonly string[]])[] = [
  [1, ['january', 'jan']],
  [2, ['february', 'feb']],
  [3, ['march', 'mar']],
  [4, ['april', 'apr']],
  [5, ['may']],
  [6, ['june', 'jun']],
  [7, ['july', 'jul']],
  [8, ['august', 'aug']],
  [9, ['september', 'sept', 'sep']],
  [10, ['october', 'oct']],
  [11, ['november', 'nov']],
  [12, ['december', 'dec']],
];

/**
 * The next occurrence of `weekday` strictly after today — "monday" on a Monday
 * means the Monday a week out, not this morning, which has already gone.
 */
function nextWeekday(today: IsoDate, weekday: number): IsoDate {
  const delta = (weekday - dayOfWeek(today) + 7) % 7;
  return isoAdd(today, delta === 0 ? 7 : delta);
}

/** Builds an alternation that prefers the longest spelling of each word. */
function alternation(words: readonly string[]): string {
  return [...words].sort((a, b) => b.length - a.length).join('|');
}

const WEEKDAY_WORDS = WEEKDAYS.flatMap(([, names]) => names);
const MONTH_WORDS = MONTHS.flatMap(([, names]) => names);

/**
 * One pattern, tried in order. Each entry names the phrases it matches and
 * turns a successful match into a date.
 *
 * `\b` boundaries on both ends keep "monday" out of "mondays" and, more
 * importantly, keep "sat" from matching inside "satisfy" — the abbreviations
 * are why every rule here is anchored.
 */
const RULES: readonly {
  re: RegExp;
  resolve: (m: RegExpExecArray, today: IsoDate) => IsoDate | null;
}[] = [
  // "today" / "tod"
  { re: /\b(today|tod)\b/i, resolve: (_m, today) => today },
  // "tomorrow" / "tmrw" / "tom"
  { re: /\b(tomorrow|tmrw|tmw|tom)\b/i, resolve: (_m, today) => isoAdd(today, 1) },
  // "yesterday" — rare on a task, but unambiguous when written
  { re: /\byesterday\b/i, resolve: (_m, today) => isoAdd(today, -1) },
  // "in 3 days" / "in 2 weeks"
  {
    re: /\bin (\d{1,3}) (day|days|week|weeks)\b/i,
    resolve: (m, today) => {
      const n = Number(m[1]);
      if (!Number.isFinite(n)) return null;
      return isoAdd(today, m[2]?.toLowerCase().startsWith('week') === true ? n * 7 : n);
    },
  },
  // "next monday" — same as "monday"; the word is how people say it
  {
    re: new RegExp(`\\bnext (${alternation(WEEKDAY_WORDS)})\\b`, 'i'),
    resolve: (m, today) => {
      const day = WEEKDAYS.find(([, names]) => names.includes(m[1]?.toLowerCase() ?? ''));
      return day === undefined ? null : nextWeekday(today, day[0]);
    },
  },
  { re: /\bnext week\b/i, resolve: (_m, today) => isoAdd(today, 7) },
  // "mon" / "tues" / "wednesday"
  {
    re: new RegExp(`\\b(${alternation(WEEKDAY_WORDS)})\\b`, 'i'),
    resolve: (m, today) => {
      const day = WEEKDAYS.find(([, names]) => names.includes(m[1]?.toLowerCase() ?? ''));
      return day === undefined ? null : nextWeekday(today, day[0]);
    },
  },
  // "jan 5" / "5 jan" / "january 5th"
  {
    re: new RegExp(`\\b(${alternation(MONTH_WORDS)})\\.? (\\d{1,2})(st|nd|rd|th)?\\b`, 'i'),
    resolve: (m, today) => monthDay(m[1], m[2], today),
  },
  {
    re: new RegExp(`\\b(\\d{1,2})(st|nd|rd|th)? (${alternation(MONTH_WORDS)})\\b`, 'i'),
    resolve: (m, today) => monthDay(m[3], m[1], today),
  },
  // A literal ISO date typed in full.
  {
    re: /\b(\d{4}-\d{2}-\d{2})\b/,
    resolve: (m) => (m[1] !== undefined && isValidIsoDate(m[1]) ? m[1] : null),
  },
];

/**
 * Resolves a month name and day to the next such date at or after today —
 * "jan 5" in December means next January, not the one ten months gone.
 */
function monthDay(
  monthWord: string | undefined,
  dayWord: string | undefined,
  today: IsoDate,
): IsoDate | null {
  const month = MONTHS.find(([, names]) => names.includes(monthWord?.toLowerCase() ?? ''));
  const day = Number(dayWord);
  if (month === undefined || !Number.isFinite(day) || day < 1 || day > 31) return null;
  const year = Number(today.slice(0, 4));
  const iso = (y: number): string =>
    `${String(y)}-${String(month[0]).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  // Walk forward to the first real occurrence at or after today. The loop
  // rather than a single +1 is what makes "feb 29" land on the next leap year
  // instead of a date that does not exist; "feb 30" is never valid in any
  // year, so it falls through to null rather than rolling into March.
  for (let y = year; y <= year + 4; y += 1) {
    const candidate = iso(y);
    if (isValidIsoDate(candidate) && candidate >= today) return candidate;
  }
  return null;
}

/**
 * The first date phrase in `text`, or null. At most one is reported: a title
 * with two dates in it is ambiguous, and silently picking one would be a
 * guess. Rules are tried in order and the earliest match in the string wins,
 * so "call Bob tomorrow about friday" resolves to tomorrow.
 */
export function findNlDate(text: string, today: IsoDate): NlDateMatch | null {
  let best: NlDateMatch | null = null;
  for (const rule of RULES) {
    const m = rule.re.exec(text);
    if (m === null) continue;
    const date = rule.resolve(m, today);
    if (date === null) continue;
    const start = m.index;
    if (best === null || start < best.start) {
      best = { date, start, end: start + m[0].length, text: m[0] };
    }
  }
  return best;
}
