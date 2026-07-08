import type { IsoDate, Task } from '../types';

import { dayDiff } from './dates';
import { byDue } from './sort';

/** Calendar month key `YYYY-MM`. */
export type MonthKey = string;

export function monthTitle(month: MonthKey): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y ?? 1970, (m ?? 1) - 1 + delta, 1);
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * The month laid out as a 7-column grid: leading/trailing null cells pad to
 * whole weeks; each real cell is the day's IsoDate.
 */
export function monthCells(month: MonthKey): (IsoDate | null)[] {
  const [y, m] = month.split('-').map(Number);
  const year = y ?? 1970;
  const mon = m ?? 1;
  const startDow = new Date(year, mon - 1, 1).getDay();
  const days = new Date(year, mon, 0).getDate();

  const cells: (IsoDate | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= days; d++) {
    cells.push(`${String(year)}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** Tasks that appear on the calendar: dated and not Dropped (Done shows struck). */
export function calendarTasks(tasks: readonly Task[]): Task[] {
  return tasks.filter((t) => t.dueDate !== null && t.status !== 'Dropped');
}

export function tasksByDueDate(tasks: readonly Task[]): Map<IsoDate, Task[]> {
  const map = new Map<IsoDate, Task[]>();
  for (const t of calendarTasks(tasks)) {
    if (t.dueDate === null) continue;
    const list = map.get(t.dueDate);
    if (list === undefined) map.set(t.dueDate, [t]);
    else list.push(t);
  }
  return map;
}

/** Next open dated tasks from today forward (prototype: top 10). */
export function upcomingTasks(tasks: readonly Task[], today: IsoDate, limit = 10): Task[] {
  return calendarTasks(tasks)
    .filter((t) => t.status !== 'Done' && t.dueDate !== null && dayDiff(t.dueDate, today) >= 0)
    .sort(byDue)
    .slice(0, limit);
}
