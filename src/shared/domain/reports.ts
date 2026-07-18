import type { IsoDate, Project, Task, Workspace } from '../types';

import { dayDiff, fmtLong, fmtShort, isoAdd, isValidIsoDate, weekStart } from './dates';
import {
  indexTasks,
  isArchived,
  isOpen,
  isOverdue,
  overdueDependency,
  relativeDueLabel,
} from './derive';
import { byDue } from './sort';

/**
 * The four report builders + plain-text serializers (prototype viewReports /
 * copyReport). Reports are scoped by a project filter so a work report can
 * never leak home projects, and vice versa.
 */

export type ReportFilter = 'all' | 'work' | 'home' | `tag:${string}`;

/** Archived projects never report — they are parked, not in flight. */
export function filterProjects(projects: readonly Project[], filter: ReportFilter): Project[] {
  return projects.filter((p) => {
    if (isArchived(p)) return false;
    if (filter === 'all') return true;
    if (filter === 'work' || filter === 'home') return p.category === filter;
    return p.tags.includes(filter.slice(4));
  });
}

function tasksFor(ws: Workspace, projectId: string): Task[] {
  return ws.tasks.filter((t) => t.projectId === projectId);
}

// ---------- Weekly status ----------

export interface WeeklyBlock {
  project: Project;
  /** Completed within the last 7 days. */
  done: Task[];
  /** Open and due within the next 7 days (incl. today). */
  planned: Task[];
  /** At risk: overdue, or directly dependent on an overdue task. */
  atRisk: Task[];
}

export function weeklyStatus(ws: Workspace, filter: ReportFilter, today: IsoDate): WeeklyBlock[] {
  const byId = indexTasks(ws.tasks);
  return filterProjects(ws.projects, filter)
    .map((project) => {
      const tasks = tasksFor(ws, project.id);
      const done = tasks.filter(
        (t) =>
          t.completedAt !== null &&
          dayDiff(today, t.completedAt) >= 0 &&
          dayDiff(today, t.completedAt) <= 7,
      );
      const planned = tasks.filter(
        (t) =>
          isOpen(t) &&
          t.dueDate !== null &&
          dayDiff(t.dueDate, today) >= 0 &&
          dayDiff(t.dueDate, today) <= 7,
      );
      const atRisk = tasks.filter(
        (t) => isOpen(t) && (isOverdue(t, today) || overdueDependency(t, byId, today) !== null),
      );
      return { project, done, planned, atRisk };
    })
    .filter((b) => b.done.length > 0 || b.planned.length > 0 || b.atRisk.length > 0);
}

export function weeklyStatusText(blocks: readonly WeeklyBlock[], today: IsoDate): string {
  let out = `WEEKLY STATUS — ${fmtLong(today)}\n\n`;
  for (const b of blocks) {
    out += `## ${b.project.name}\n`;
    out += `Done this week: ${b.done.map((t) => t.title).join('; ') || '—'}\n`;
    out += `Planned next: ${b.planned.map((t) => t.title).join('; ') || '—'}\n`;
    out += `At risk: ${b.atRisk.map((t) => t.title).join('; ') || 'None'}\n\n`;
  }
  return out;
}

// ---------- Portfolio roll-up ----------

export interface PortfolioRow {
  project: Project;
  open: number;
  done: number;
  overdue: number;
  next: Task | null;
}

export function portfolioRollup(
  ws: Workspace,
  filter: ReportFilter,
  today: IsoDate,
): PortfolioRow[] {
  return filterProjects(ws.projects, filter).map((project) => {
    const tasks = tasksFor(ws, project.id);
    const open = tasks.filter(isOpen);
    const next = open.filter((t) => t.dueDate !== null).sort(byDue)[0] ?? null;
    return {
      project,
      open: open.length,
      done: tasks.filter((t) => t.status === 'Done').length,
      overdue: open.filter((t) => isOverdue(t, today)).length,
      next,
    };
  });
}

export function portfolioText(rows: readonly PortfolioRow[], today: IsoDate): string {
  let out = `PORTFOLIO ROLL-UP — ${fmtLong(today)}\n\n`;
  for (const r of rows) {
    out += `- ${r.project.name} [${r.project.category}]: ${r.open} open, ${r.done} done`;
    if (r.overdue > 0) out += `, ${r.overdue} overdue`;
    out += '\n';
  }
  return out;
}

// ---------- Retrospective ----------

export interface RetroGroup {
  project: Project;
  tasks: Task[];
}

export interface RetroResult {
  total: number;
  groups: RetroGroup[];
}

export function retrospective(
  ws: Workspace,
  filter: ReportFilter,
  from: IsoDate,
  to: IsoDate,
): RetroResult {
  const projects = filterProjects(ws.projects, filter);
  const ids = new Set(projects.map((p) => p.id));
  const done = ws.tasks
    .filter(
      (t) =>
        t.completedAt !== null &&
        ids.has(t.projectId) &&
        t.completedAt >= from &&
        t.completedAt <= to,
    )
    .sort((a, b) => ((a.completedAt ?? '') < (b.completedAt ?? '') ? 1 : -1));

  const groups: RetroGroup[] = [];
  const byProject = new Map<string, RetroGroup>();
  for (const t of done) {
    let group = byProject.get(t.projectId);
    if (group === undefined) {
      const project = projects.find((p) => p.id === t.projectId);
      if (project === undefined) continue;
      group = { project, tasks: [] };
      byProject.set(t.projectId, group);
      groups.push(group);
    }
    group.tasks.push(t);
  }
  return { total: done.length, groups };
}

/**
 * Retrospective date-range presets. "Weeks" run Sun–Sat (D15); calendar
 * months/years are literal. `custom` is the UI escape hatch and resolves
 * to nothing here.
 */
export const RETRO_PRESETS = [
  ['last-week', 'Last week'],
  ['last-month', 'Last month'],
  ['month-to-date', 'Month to date'],
  ['year-to-date', 'Year to date'],
  ['last-30', 'Last 30 days'],
  ['custom', 'Custom range'],
] as const;

export type RetroPreset = (typeof RETRO_PRESETS)[number][0];

export function retroPresetRange(
  preset: Exclude<RetroPreset, 'custom'>,
  today: IsoDate,
): { from: IsoDate; to: IsoDate } {
  switch (preset) {
    case 'last-week': {
      const start = isoAdd(weekStart(today), -7);
      return { from: start, to: isoAdd(start, 6) };
    }
    case 'last-month': {
      const firstOfThis = `${today.slice(0, 7)}-01`;
      const lastOfPrev = isoAdd(firstOfThis, -1);
      return { from: `${lastOfPrev.slice(0, 7)}-01`, to: lastOfPrev };
    }
    case 'month-to-date':
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case 'year-to-date':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case 'last-30':
      return { from: isoAdd(today, -30), to: today };
  }
}

/** One column of the retrospective completions chart. */
export interface RetroBucket {
  start: IsoDate;
  /** Inclusive; clamped to the report range. */
  end: IsoDate;
  count: number;
  label: string;
}

/**
 * Completions bucketed for charting: daily up to a month of range, else by
 * Sun–Sat week (first/last buckets clamped to the range). Buckets with no
 * completions are kept so the timeline reads true.
 */
export function retroBuckets(result: RetroResult, from: IsoDate, to: IsoDate): RetroBucket[] {
  // Date inputs pass through '' / partial values while being edited.
  if (!isValidIsoDate(from) || !isValidIsoDate(to) || to < from) return [];
  const completions = result.groups.flatMap((g) => g.tasks.map((t) => t.completedAt ?? ''));
  const daily = dayDiff(to, from) <= 31;
  const buckets: RetroBucket[] = [];
  let cursor = from;
  while (cursor <= to) {
    const end = daily
      ? cursor
      : isoAdd(weekStart(cursor), 6) < to
        ? isoAdd(weekStart(cursor), 6)
        : to;
    buckets.push({
      start: cursor,
      end,
      count: completions.filter((c) => c >= cursor && c <= end).length,
      label: daily ? fmtShort(cursor) : `${fmtShort(cursor)} – ${fmtShort(end)}`,
    });
    cursor = isoAdd(end, 1);
  }
  return buckets;
}

export function retrospectiveText(result: RetroResult, from: IsoDate, to: IsoDate): string {
  let out = `RETROSPECTIVE — ${fmtShort(from)} to ${fmtShort(to)}\n${result.total} tasks completed.\n\n`;
  for (const g of result.groups) {
    for (const t of g.tasks) {
      out += `- [${fmtShort(t.completedAt)}] ${g.project.name}: ${t.title}\n`;
    }
  }
  return out;
}

// ---------- At-risk ----------

export interface RiskRow {
  task: Task;
  project: Project;
  reason: string;
  color: string;
}

/**
 * At risk = overdue, or directly dependent on an overdue task (which names
 * the culprit). Ordinary open dependencies are how plans work, not a risk.
 */
export function atRiskReport(ws: Workspace, filter: ReportFilter, today: IsoDate): RiskRow[] {
  const byId = indexTasks(ws.tasks);
  const rows: RiskRow[] = [];
  for (const project of filterProjects(ws.projects, filter)) {
    for (const task of tasksFor(ws, project.id)) {
      if (!isOpen(task)) continue;
      if (isOverdue(task, today)) {
        rows.push({
          task,
          project,
          reason: relativeDueLabel(task.dueDate, today).text,
          color: '#d94c3a',
        });
        continue;
      }
      const culprit = overdueDependency(task, byId, today);
      if (culprit !== null) {
        rows.push({
          task,
          project,
          reason: `Waiting on overdue: ${culprit.title || 'Untitled task'}`,
          color: '#a8710f',
        });
      }
    }
  }
  return rows.sort((a, b) => byDue(a.task, b.task));
}

export function atRiskText(rows: readonly RiskRow[], today: IsoDate): string {
  let out = `AT-RISK — ${fmtLong(today)}\n\n`;
  for (const r of rows) {
    out += `- ${r.project.name}: ${r.task.title} (${r.reason})\n`;
  }
  return out;
}
