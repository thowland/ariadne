import type { Contact, Deferral, IsoDate, Project, Task, TaskPriority, Workspace } from '../types';
import { TASK_PRIORITIES } from '../types';

import { contactName, contactSortName } from './contacts';
import { dayDiff, fmtLong, fmtShort, isoAdd, isValidIsoDate, weekStart } from './dates';
import {
  indexTasks,
  isArchived,
  isOpen,
  isOverdue,
  overdueDependency,
  relativeDueLabel,
} from './derive';
import type { EstimateTotals } from './estimate';
import { estimateTotals, formatEstimate } from './estimate';
import { byDue } from './sort';

/**
 * The report builders + plain-text serializers (prototype viewReports /
 * copyReport). Reports are scoped by a project filter so a work report can
 * never leak home projects, and vice versa.
 */

export type ReportFilter = 'all' | 'work' | 'home' | `tag:${string}`;

/**
 * Archived projects never report — they are parked, not in flight. The
 * retrospective is the one exception (D19): it looks backwards, and work
 * finished before a project was archived still counts as work done.
 */
export function filterProjects(
  projects: readonly Project[],
  filter: ReportFilter,
  opts: { includeArchived?: boolean } = {},
): Project[] {
  return projects.filter((p) => {
    if (isArchived(p) && opts.includeArchived !== true) return false;
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
  /** Effort estimates over the project's tasks (D36). */
  effort: EstimateTotals;
}

/**
 * Per-project open/done/overdue counts and the next thing due.
 *
 * `opts.includeArchived` exists for the Projects inventory screen, which is a
 * deliberate exception to D13 the user opts into — every report leaves it
 * unset and so never sees an archived project.
 */
export function portfolioRollup(
  ws: Workspace,
  filter: ReportFilter,
  today: IsoDate,
  opts: { includeArchived?: boolean } = {},
): PortfolioRow[] {
  return filterProjects(ws.projects, filter, opts).map((project) => {
    const tasks = tasksFor(ws, project.id);
    const open = tasks.filter(isOpen);
    const next = open.filter((t) => t.dueDate !== null).sort(byDue)[0] ?? null;
    return {
      project,
      open: open.length,
      done: tasks.filter((t) => t.status === 'Done').length,
      overdue: open.filter((t) => isOverdue(t, today)).length,
      next,
      effort: estimateTotals(tasks),
    };
  });
}

/** Sortable columns of the portfolio table, in display order. */
export const PORTFOLIO_COLUMNS = [
  ['project', 'Project'],
  ['category', 'Type'],
  ['progress', 'Progress'],
  ['open', 'Open'],
  ['done', 'Done'],
  ['overdue', 'Overdue'],
  ['effort', 'Effort left'],
  ['next', 'Next due'],
] as const;

export type PortfolioSortKey = (typeof PORTFOLIO_COLUMNS)[number][0];
export type SortDirection = 'asc' | 'desc';

/** Share of a project's tasks that are Done, 0–1; 0 when it has no tasks. */
export function portfolioProgress(row: PortfolioRow): number {
  const total = row.open + row.done;
  return total > 0 ? row.done / total : 0;
}

/**
 * Sorts a copy of the rollup. Ties always fall back to project name so the
 * order is total — re-sorting by a coarse column (category, a count shared by
 * several projects) must not shuffle rows that compare equal.
 *
 * Projects with no next due date sort last in both directions: "nothing
 * scheduled" is the absence of a date, not a date before or after every other.
 */
export function sortPortfolio(
  rows: readonly PortfolioRow[],
  key: PortfolioSortKey,
  direction: SortDirection,
): PortfolioRow[] {
  const sign = direction === 'asc' ? 1 : -1;
  const name = (r: PortfolioRow): string => r.project.name.toLowerCase();
  const compare = (a: PortfolioRow, b: PortfolioRow): number => {
    switch (key) {
      case 'project':
        return name(a).localeCompare(name(b));
      case 'category':
        return a.project.category.localeCompare(b.project.category);
      case 'progress':
        return portfolioProgress(a) - portfolioProgress(b);
      case 'open':
        return a.open - b.open;
      case 'done':
        return a.done - b.done;
      case 'overdue':
        return a.overdue - b.overdue;
      case 'effort':
        return a.effort.open - b.effort.open;
      case 'next': {
        if (a.next === null || b.next === null) {
          if (a.next === null && b.next === null) return 0;
          // Unscheduled sinks regardless of direction, so undo the caller's sign.
          return (a.next === null ? 1 : -1) * sign;
        }
        return (a.next.dueDate ?? '').localeCompare(b.next.dueDate ?? '');
      }
    }
  };
  return [...rows].sort((a, b) => {
    const primary = compare(a, b) * sign;
    return primary !== 0 ? primary : name(a).localeCompare(name(b));
  });
}

/** The portfolio roll-up as CSV rows — header first, one row per project. */
export function portfolioCsvRows(rows: readonly PortfolioRow[]): string[][] {
  const header = [
    'Project',
    'Type',
    'Progress %',
    'Open',
    'Done',
    'Overdue',
    // Hours, not "2d 4h": a spreadsheet can sum a number and cannot sum a label.
    'Effort left (h)',
    'Effort total (h)',
    'Next due',
  ];
  return [
    header,
    ...rows.map((r) => [
      r.project.name,
      r.project.category,
      String(Math.round(portfolioProgress(r) * 100)),
      String(r.open),
      String(r.done),
      String(r.overdue),
      String(r.effort.open),
      String(r.effort.total),
      // The raw ISO date, not the "in 3d" label: a spreadsheet can sort and
      // filter a date, and cannot do anything useful with a relative phrase.
      r.next?.dueDate ?? '',
    ]),
  ];
}

export function portfolioText(rows: readonly PortfolioRow[], today: IsoDate): string {
  let out = `PORTFOLIO ROLL-UP — ${fmtLong(today)}\n\n`;
  for (const r of rows) {
    out += `- ${r.project.name} [${r.project.category}]: ${r.open} open, ${r.done} done`;
    if (r.overdue > 0) out += `, ${r.overdue} overdue`;
    if (r.effort.open > 0) out += `, ${formatEstimate(r.effort.open)} left`;
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

/**
 * Completions in `[from, to]`, grouped by project. Archived projects are
 * included (D19) — a project parked last month still did the work.
 */
export function retrospective(
  ws: Workspace,
  filter: ReportFilter,
  from: IsoDate,
  to: IsoDate,
): RetroResult {
  const projects = filterProjects(ws.projects, filter, { includeArchived: true });
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

// ---------- Repeatedly deferred (D23) ----------

/** Threshold choices for "delayed more than X times". */
export const DEFER_THRESHOLDS = [2, 3, 5, 8] as const;
export const DEFER_THRESHOLD_DEFAULT = 3;

export interface DeferralRow {
  task: Task;
  project: Project;
  /** Recorded push-outs. */
  count: number;
  /** Days added across every push-out (the cost of the churn). */
  totalDays: number;
  /** Days from the first recorded due date to the current one. */
  slipDays: number;
  /** Days since the most recent push-out. */
  daysSinceLast: number;
  first: Deferral;
  last: Deferral;
  /** Still open and already past its (latest) due date. */
  overdueNow: boolean;
}

export interface DeferralProjectRow {
  project: Project;
  tasks: number;
  deferrals: number;
  days: number;
}

export interface DeferralAnalytics {
  /** Tasks in scope with at least one recorded push-out. */
  tasksEverDeferred: number;
  /** Tasks in scope at or over the threshold (i.e. `rows.length`). */
  tasksOverThreshold: number;
  /** Push-outs across every deferred task in scope (not just the rows). */
  totalDeferrals: number;
  /** Days added across every push-out in scope. */
  totalDaysSlipped: number;
  /** Mean days added per push-out, one decimal. */
  avgDaysPerDeferral: number;
  /** Median push-out count among tasks that have ever been deferred. */
  medianDeferrals: number;
  /** Of the over-threshold rows, how many are still open and overdue. */
  chronicOverdue: number;
  /** Of the over-threshold rows, how many eventually got done. */
  completedAnyway: number;
  /** Worst offenders first. */
  byProject: DeferralProjectRow[];
  /** Which priorities absorb the churn — Low here is fine, Critical is not. */
  byPriority: { priority: TaskPriority; deferrals: number }[];
}

export interface DeferralResult {
  rows: DeferralRow[];
  analytics: DeferralAnalytics;
  threshold: number;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function deferralDays(list: readonly Deferral[]): number {
  return list.reduce((sum, d) => sum + Math.max(0, dayDiff(d.to, d.from)), 0);
}

/**
 * Tasks whose due date keeps sliding (D23). `minCount` is the "delayed more
 * than X times" threshold for the listed rows; the analytics deliberately
 * summarize *every* deferred task in scope, so the headline numbers do not
 * move when the user changes the threshold.
 *
 * Dropped tasks are excluded (abandoned work is not deferred work); Done
 * tasks stay in, since a task that shipped after eight reschedules is exactly
 * what this report exists to surface.
 */
export function deferredReport(
  ws: Workspace,
  filter: ReportFilter,
  minCount: number,
  today: IsoDate,
): DeferralResult {
  const projects = filterProjects(ws.projects, filter);
  const byProjectId = new Map(projects.map((p) => [p.id, p]));

  const all: DeferralRow[] = [];
  for (const task of ws.tasks) {
    const project = byProjectId.get(task.projectId);
    if (project === undefined || task.status === 'Dropped') continue;
    const list = task.deferrals ?? [];
    const first = list[0];
    const last = list[list.length - 1];
    if (first === undefined || last === undefined) continue;
    all.push({
      task,
      project,
      count: list.length,
      totalDays: deferralDays(list),
      slipDays: Math.max(0, dayDiff(task.dueDate ?? last.to, first.from)),
      daysSinceLast: Math.max(0, dayDiff(today, last.on)),
      first,
      last,
      overdueNow: isOverdue(task, today),
    });
  }

  const rows = all
    .filter((r) => r.count >= minCount)
    .sort(
      (a, b) =>
        b.count - a.count ||
        b.totalDays - a.totalDays ||
        a.daysSinceLast - b.daysSinceLast ||
        a.task.title.localeCompare(b.task.title),
    );

  const projectRows = new Map<string, DeferralProjectRow>();
  for (const r of all) {
    const entry = projectRows.get(r.project.id) ?? {
      project: r.project,
      tasks: 0,
      deferrals: 0,
      days: 0,
    };
    entry.tasks += 1;
    entry.deferrals += r.count;
    entry.days += r.totalDays;
    projectRows.set(r.project.id, entry);
  }

  const totalDeferrals = all.reduce((sum, r) => sum + r.count, 0);
  const totalDaysSlipped = all.reduce((sum, r) => sum + r.totalDays, 0);

  return {
    threshold: minCount,
    rows,
    analytics: {
      tasksEverDeferred: all.length,
      tasksOverThreshold: rows.length,
      totalDeferrals,
      totalDaysSlipped,
      avgDaysPerDeferral:
        totalDeferrals === 0 ? 0 : Math.round((totalDaysSlipped / totalDeferrals) * 10) / 10,
      medianDeferrals: median(all.map((r) => r.count)),
      chronicOverdue: rows.filter((r) => r.overdueNow).length,
      completedAnyway: rows.filter((r) => r.task.status === 'Done').length,
      byProject: [...projectRows.values()].sort(
        (a, b) => b.deferrals - a.deferrals || b.days - a.days,
      ),
      byPriority: TASK_PRIORITIES.map((priority) => ({
        priority,
        deferrals: all
          .filter((r) => r.task.priority === priority)
          .reduce((sum, r) => sum + r.count, 0),
      })).filter((p) => p.deferrals > 0),
    },
  };
}

export function deferredText(result: DeferralResult, today: IsoDate): string {
  const a = result.analytics;
  let out = `REPEATEDLY DEFERRED — ${fmtLong(today)}\n`;
  out += `Threshold: ${result.threshold}+ reschedules\n\n`;
  out += `${a.tasksOverThreshold} task(s) over threshold of ${a.tasksEverDeferred} ever deferred; `;
  out += `${a.totalDeferrals} reschedule(s) costing ${a.totalDaysSlipped} day(s) `;
  out += `(avg ${a.avgDaysPerDeferral} days each, median ${a.medianDeferrals} per task).\n`;
  out += `${a.chronicOverdue} still open and overdue; ${a.completedAnyway} eventually completed.\n\n`;
  for (const r of result.rows) {
    out += `- ${r.project.name}: ${r.task.title || 'Untitled task'} — ${r.count}× deferred, `;
    out += `+${r.totalDays}d, first due ${fmtShort(r.first.from)} → now ${fmtShort(r.task.dueDate ?? r.last.to)}`;
    out += r.overdueNow ? ' (OVERDUE)\n' : '\n';
  }
  if (a.byProject.length > 0) {
    out += '\nBy project:\n';
    for (const p of a.byProject) {
      out += `- ${p.project.name}: ${p.deferrals} reschedule(s) across ${p.tasks} task(s), +${p.days}d\n`;
    }
  }
  return out;
}

// ---------- Contact activity (D31) ----------

/**
 * A task counts toward the window when it was completed in it, created in it,
 * or is still open and due in it. Deliberately broader than "completed": work
 * you are *currently* carrying for someone is collaboration too, and a report
 * that only counted finished tasks would rank a person at zero right up to
 * the day their project ships.
 */
function taskInWindow(t: Task, from: IsoDate, to: IsoDate): boolean {
  if (t.completedAt !== null && t.completedAt >= from && t.completedAt <= to) return true;
  if (t.createdAt >= from && t.createdAt <= to) return true;
  return isOpen(t) && t.dueDate !== null && t.dueDate >= from && t.dueDate <= to;
}

export interface ContactActivityRow {
  contact: Contact;
  /** In-window tasks still open. */
  open: number;
  /** In-window tasks completed. */
  done: number;
  /** In-window open tasks already past due. */
  overdue: number;
  /** Every in-window task linked to them (the ranking key). */
  total: number;
  /** In-scope projects they touch, through a task or a direct attachment. */
  projects: Project[];
  /** Latest completion (or creation) among their in-window tasks. */
  lastActivity: IsoDate | null;
  /** Days between `lastActivity` and today; null when there is no activity. */
  daysSinceLast: number | null;
}

export interface ContactActivityAnalytics {
  /** Contacts with any in-window activity or in-scope attachment. */
  people: number;
  /** Distinct organizations across those people ("" is not a company). */
  companies: number;
  /** In-window tasks with at least one contact on them. */
  collaborativeTasks: number;
  /** In-window tasks in scope, whether or not anyone is linked. */
  windowTasks: number;
  /** Contacts whose in-window tasks are all still open — outstanding asks. */
  peopleWithOpenWork: number;
  /** Open in-window tasks past due across every contact. */
  overdueWithPeople: number;
  /** Busiest organizations first. */
  byCompany: { company: string; people: number; tasks: number }[];
}

export interface ContactActivityResult {
  rows: ContactActivityRow[];
  analytics: ContactActivityAnalytics;
}

/**
 * Who you have been working with, over a date range (D31).
 *
 * Scoped through `filterProjects` like every other report, so a work-filtered
 * run can never surface the plumber attached to a home project. Contacts
 * attached to an in-scope project but carrying no in-window task still get a
 * row — a stakeholder with nothing assigned is a real answer to "who is
 * involved here" — and sort to the bottom on a total of zero.
 */
export function contactActivity(
  ws: Workspace,
  filter: ReportFilter,
  from: IsoDate,
  to: IsoDate,
  today: IsoDate,
): ContactActivityResult {
  const projects = filterProjects(ws.projects, filter);
  const byProjectId = new Map(projects.map((p) => [p.id, p]));

  const inWindow = ws.tasks.filter(
    (t) => byProjectId.has(t.projectId) && taskInWindow(t, from, to),
  );

  const rows: ContactActivityRow[] = [];
  for (const contact of ws.contacts) {
    const tasks = inWindow.filter((t) => (t.contactIds ?? []).includes(contact.id));
    const touched = new Set(tasks.map((t) => t.projectId));
    for (const p of projects) if ((p.contactIds ?? []).includes(contact.id)) touched.add(p.id);
    if (tasks.length === 0 && touched.size === 0) continue;

    const dates = tasks.map((t) => t.completedAt ?? t.createdAt).sort();
    const lastActivity = dates[dates.length - 1] ?? null;
    rows.push({
      contact,
      open: tasks.filter(isOpen).length,
      done: tasks.filter((t) => t.status === 'Done').length,
      overdue: tasks.filter((t) => isOverdue(t, today)).length,
      total: tasks.length,
      projects: projects.filter((p) => touched.has(p.id)),
      lastActivity,
      daysSinceLast: lastActivity === null ? null : Math.max(0, dayDiff(today, lastActivity)),
    });
  }

  rows.sort(
    (a, b) =>
      b.total - a.total ||
      b.done - a.done ||
      b.projects.length - a.projects.length ||
      contactSortName(a.contact).localeCompare(contactSortName(b.contact)),
  );

  const companyRows = new Map<string, { company: string; people: number; tasks: number }>();
  for (const r of rows) {
    const company = r.contact.company.trim();
    if (company === '') continue;
    const entry = companyRows.get(company.toLowerCase()) ?? { company, people: 0, tasks: 0 };
    entry.people += 1;
    entry.tasks += r.total;
    companyRows.set(company.toLowerCase(), entry);
  }

  return {
    rows,
    analytics: {
      people: rows.length,
      companies: companyRows.size,
      collaborativeTasks: inWindow.filter((t) => (t.contactIds ?? []).length > 0).length,
      windowTasks: inWindow.length,
      peopleWithOpenWork: rows.filter((r) => r.open > 0).length,
      overdueWithPeople: rows.reduce((sum, r) => sum + r.overdue, 0),
      byCompany: [...companyRows.values()].sort(
        (a, b) => b.tasks - a.tasks || b.people - a.people || a.company.localeCompare(b.company),
      ),
    },
  };
}

/** "1 person" / "4 people" — the plural English actually uses. */
function people(n: number): string {
  return `${String(n)} ${n === 1 ? 'person' : 'people'}`;
}

export function contactActivityText(
  result: ContactActivityResult,
  from: IsoDate,
  to: IsoDate,
): string {
  const a = result.analytics;
  let out = `CONTACT ACTIVITY — ${fmtShort(from)} to ${fmtShort(to)}\n`;
  out += `${people(a.people)} across ${String(a.companies)} organization(s); `;
  out += `${a.collaborativeTasks} of ${a.windowTasks} task(s) in range involve someone.\n`;
  out += `${a.peopleWithOpenWork} still carrying open work; ${a.overdueWithPeople} overdue.\n\n`;
  for (const r of result.rows) {
    out += `- ${contactName(r.contact)}`;
    if (r.contact.company.trim() !== '') out += ` (${r.contact.company})`;
    out += `: ${r.total} task(s) — ${r.open} open, ${r.done} done`;
    if (r.overdue > 0) out += `, ${r.overdue} overdue`;
    out += `; ${r.projects.length} project(s)`;
    if (r.lastActivity !== null) out += `; last ${fmtShort(r.lastActivity)}`;
    out += '\n';
    if (r.contact.email.trim() !== '' || r.contact.phone.trim() !== '') {
      out += `  ${[r.contact.email, r.contact.phone].filter((x) => x.trim() !== '').join(' · ')}\n`;
    }
  }
  if (a.byCompany.length > 0) {
    out += '\nBy organization:\n';
    for (const c of a.byCompany) {
      out += `- ${c.company}: ${c.tasks} task(s) across ${people(c.people)}\n`;
    }
  }
  return out;
}
