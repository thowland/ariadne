import type { IsoDate, Project, Task } from '../types';

import { dayDiff, fmtShort, weekEnd } from './dates';

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

/**
 * Due after today but still inside the current calendar week (weeks run
 * Sun–Sat, D15). Excludes today and overdue.
 */
export function isDueThisWeek(t: Task, today: IsoDate): boolean {
  if (!isOpen(t) || t.dueDate === null) return false;
  return t.dueDate > today && t.dueDate <= weekEnd(today);
}

/** Due today through Saturday — the "Due this week" stat card window (D15). */
export function isDueWithinWeek(t: Task, today: IsoDate): boolean {
  if (!isOpen(t) || t.dueDate === null) return false;
  return t.dueDate >= today && t.dueDate <= weekEnd(today);
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
 * The first *direct* dependency that is itself overdue (open + past due), or
 * null. Deliberately not transitive: at-risk should flag the immediate
 * knock-on of a slipped task, not entire downstream chains.
 */
export function overdueDependency(t: Task, byId: Map<string, Task>, today: IsoDate): Task | null {
  if (!isOpen(t)) return null;
  for (const id of t.dependsOn) {
    const dep = byId.get(id);
    if (dep !== undefined && isOverdue(dep, today)) return dep;
  }
  return null;
}

/**
 * "High priority · later": Critical/High priority with no due pressure inside
 * the current Sun–Sat week (no due date, or due after this week's Saturday;
 * overdue is excluded because those tasks already surface in the Overdue
 * section). Mirrors the D15 week boundary so every dated task lands in
 * exactly one Command Center section.
 */
export function isHighLater(t: Task, today: IsoDate): boolean {
  if (!isOpen(t)) return false;
  if (t.priority !== 'Critical' && t.priority !== 'High') return false;
  return !(t.dueDate !== null && t.dueDate <= weekEnd(today));
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

/**
 * Due label for a task row. Done/Dropped tasks can't be overdue (or due at
 * all): their due date renders as a neutral calendar date instead of the
 * red/amber relative label.
 */
export function taskDueLabel(t: Task, today: IsoDate): DueLabel {
  if (isOpen(t)) return relativeDueLabel(t.dueDate, today);
  if (t.dueDate === null) return { text: '', color: COLOR_NONE };
  return { text: fmtShort(t.dueDate), color: COLOR_NONE };
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

export function isArchived(p: Project): boolean {
  return p.archived === true;
}

/**
 * Filter helpers for the global Work/Home/All scope. Archived projects are
 * out of scope everywhere: they (and their tasks) never appear in the
 * Command Center, calendar, or day views.
 */
export type Scope = 'all' | 'work' | 'home';

export function projectsInScope(projects: readonly Project[], scope: Scope): Project[] {
  return projects.filter((p) => !isArchived(p) && (scope === 'all' || p.category === scope));
}

export function tasksInScope(
  tasks: readonly Task[],
  projects: readonly Project[],
  scope: Scope,
): Task[] {
  const inScope = new Set(projectsInScope(projects, scope).map((p) => p.id));
  return tasks.filter((t) => inScope.has(t.projectId));
}
