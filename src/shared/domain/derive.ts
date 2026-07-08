import type { IsoDate, Project, Task } from '../types';

import { dayDiff, fmtShort } from './dates';

/**
 * Derived values — computed, never stored. Semantics ported 1:1 from the
 * prototype (design/Throughline.dc.html); `today` is always injected.
 */

export function isOpen(t: Task): boolean {
  return t.status !== 'Done' && t.status !== 'Dropped';
}

export function isOverdue(t: Task, today: IsoDate): boolean {
  return isOpen(t) && t.dueDate !== null && t.dueDate < today;
}

export function isDueToday(t: Task, today: IsoDate): boolean {
  return isOpen(t) && t.dueDate === today;
}

/** Due in 1–7 days (excludes today and overdue). */
export function isDueThisWeek(t: Task, today: IsoDate): boolean {
  if (!isOpen(t) || t.dueDate === null) return false;
  const n = dayDiff(t.dueDate, today);
  return n >= 1 && n <= 7;
}

/** Due in 0–7 days — the "Due this week" stat card window. */
export function isDueWithinWeek(t: Task, today: IsoDate): boolean {
  if (!isOpen(t) || t.dueDate === null) return false;
  const n = dayDiff(t.dueDate, today);
  return n >= 0 && n <= 7;
}

export function indexTasks(tasks: readonly Task[]): Map<string, Task> {
  return new Map(tasks.map((t) => [t.id, t]));
}

/**
 * Open task with at least one open dependency. Cycle-safe by construction
 * (only inspects direct dependencies, matching the prototype).
 */
export function isBlocked(t: Task, byId: Map<string, Task>): boolean {
  if (!isOpen(t)) return false;
  return t.dependsOn.some((id) => {
    const dep = byId.get(id);
    return dep !== undefined && isOpen(dep);
  });
}

/**
 * "High priority · later": Critical/High priority with no due pressure inside
 * the week (no due date, or due more than 7 days out; overdue is excluded
 * because those tasks already surface in the Overdue section).
 */
export function isHighLater(t: Task, today: IsoDate): boolean {
  if (!isOpen(t)) return false;
  if (t.priority !== 'Critical' && t.priority !== 'High') return false;
  return !(t.dueDate !== null && dayDiff(t.dueDate, today) <= 7);
}

/** done / (total excluding Dropped); 0 when there is nothing to count. */
export function projectProgress(tasks: readonly Task[]): number {
  const total = tasks.filter((t) => t.status !== 'Dropped').length;
  if (total === 0) return 0;
  const done = tasks.filter((t) => t.status === 'Done').length;
  return done / total;
}

export interface DueLabel {
  text: string;
  color: string;
}

const COLOR_OVERDUE = '#d94c3a';
const COLOR_TODAY = '#c23b2b';
const COLOR_SOON = '#a8710f';
const COLOR_LATER = '#73736c';
const COLOR_NONE = '#9a9a92';

/** `<n>d overdue` / `Today` / `Tomorrow` / `in <n>d` (≤7) / `Mon D`. */
export function relativeDueLabel(dueDate: IsoDate | null, today: IsoDate): DueLabel {
  if (dueDate === null) return { text: '', color: COLOR_NONE };
  const n = dayDiff(dueDate, today);
  if (n < 0) return { text: `${-n}d overdue`, color: COLOR_OVERDUE };
  if (n === 0) return { text: 'Today', color: COLOR_TODAY };
  if (n === 1) return { text: 'Tomorrow', color: COLOR_SOON };
  if (n <= 7) return { text: `in ${n}d`, color: COLOR_SOON };
  return { text: fmtShort(dueDate), color: COLOR_LATER };
}

/** The open task with the earliest due date, if any. */
export function nextDueTask(tasks: readonly Task[]): Task | null {
  let best: Task | null = null;
  for (const t of tasks) {
    if (!isOpen(t) || t.dueDate === null) continue;
    if (best?.dueDate == null || t.dueDate < best.dueDate) best = t;
  }
  return best;
}

/** All distinct project tags, sorted (reports scope select). */
export function allProjectTags(projects: readonly Project[]): string[] {
  const s = new Set<string>();
  for (const p of projects) for (const tag of p.tags) s.add(tag);
  return [...s].sort();
}

/** Filter helpers for the global Work/Home/All scope. */
export type Scope = 'all' | 'work' | 'home';

export function projectsInScope(projects: readonly Project[], scope: Scope): Project[] {
  return projects.filter((p) => scope === 'all' || p.category === scope);
}

export function tasksInScope(
  tasks: readonly Task[],
  projects: readonly Project[],
  scope: Scope,
): Task[] {
  if (scope === 'all') return [...tasks];
  const inScope = new Set(projectsInScope(projects, scope).map((p) => p.id));
  return tasks.filter((t) => inScope.has(t.projectId));
}
