import type { Task } from '../types';
import { HOURS_PER_DAY } from '../types';

import { isOpen } from './derive';

/**
 * Effort estimates (D36), in hours, entered and shown as days and hours.
 *
 * Effort, not calendar: "2d" means two days of work, not "due in two days".
 * A day is `HOURS_PER_DAY` (8) — fixed rather than configurable, because the
 * number is stored in hours and a settable day length would silently
 * reinterpret every estimate already recorded the moment it changed.
 */

/** Largest estimate we will accept, so a typo cannot poison a roll-up. */
const MAX_HOURS = 100_000;

/**
 * Reads "2d 4h", "3h", "1.5d", "90m" or a bare number of hours into hours.
 * Returns null for anything unreadable and 0 for an empty string, so a
 * cleared field means "no estimate" rather than "zero effort".
 */
export function parseEstimate(input: string): number | null {
  const text = input.trim().toLowerCase();
  if (text === '') return 0;

  // A bare number is hours — the unit people omit most often.
  if (/^\d+(\.\d+)?$/.test(text)) {
    const hours = Number(text);
    return hours <= MAX_HOURS ? hours : null;
  }

  const parts = text.match(/\d+(?:\.\d+)?\s*[dhm]/g);
  if (parts === null) return null;
  // Reject trailing junk: "2d banana" is a typo, not two days.
  if (parts.join('').replace(/\s+/g, '') !== text.replace(/\s+/g, '')) return null;

  let hours = 0;
  const seen = new Set<string>();
  for (const part of parts) {
    const unit = part.slice(-1);
    // "2d 3d" is ambiguous about which the user meant.
    if (seen.has(unit)) return null;
    seen.add(unit);
    const value = Number(part.slice(0, -1).trim());
    if (!Number.isFinite(value)) return null;
    hours += unit === 'd' ? value * HOURS_PER_DAY : unit === 'm' ? value / 60 : value;
  }
  // Round to the minute: 1/3 of an hour should not persist as 0.333333….
  const rounded = Math.round(hours * 60) / 60;
  return rounded <= MAX_HOURS ? rounded : null;
}

/**
 * Hours as "2d 4h", the way it was typed. Empty string for nothing, so a
 * caller can drop it into a label without a conditional.
 */
export function formatEstimate(hours: number | undefined): string {
  if (hours === undefined || hours <= 0) return '';
  const days = Math.floor(hours / HOURS_PER_DAY);
  const rest = Math.round((hours - days * HOURS_PER_DAY) * 100) / 100;
  const parts: string[] = [];
  if (days > 0) parts.push(`${String(days)}d`);
  // Trim a trailing ".0" but keep a real fraction: 1.5h stays 1.5h.
  if (rest > 0) parts.push(`${String(Number(rest.toFixed(2)))}h`);
  return parts.join(' ');
}

export interface EstimateTotals {
  /** Effort on tasks that are still open. */
  open: number;
  /** Effort on every task that carries one, Done included. Dropped never counts. */
  total: number;
  /** Open tasks with no estimate — how much of `open` is guesswork. */
  unestimated: number;
}

/**
 * Sums estimates over a task list. Dropped tasks are excluded from both
 * figures: abandoned work is not effort remaining, and counting it in the
 * total would make a project look busier for having given up on something.
 */
export function estimateTotals(tasks: readonly Task[]): EstimateTotals {
  let open = 0;
  let total = 0;
  let unestimated = 0;
  for (const t of tasks) {
    if (t.status === 'Dropped') continue;
    const hours = t.estimateHours ?? 0;
    total += hours;
    if (isOpen(t)) {
      open += hours;
      if (hours === 0) unestimated += 1;
    }
  }
  return { open, total, unestimated };
}
