import type { Project, Settings, Task, Workspace } from '../types';

import { dayDiff } from './dates';
import type { MutationCtx, MutationResult } from './mutate';

/**
 * Todoist integration (spec §9): Ariadne pushes tasks out, and the completion
 * sync (D17) closes the loop — tasks that carry a `todoist:<id>` marker and
 * were completed in Todoist get marked Done here. The marker line in the task
 * notes is the join key in both directions.
 */

/** Legacy project id from the pre-1.10 import; may exist in old workspaces. */
export const TODOIST_INBOX_ID = 'todoist-inbox';

const MARKER_RE = /^todoist:(\S+)$/m;

export function todoistMarkerOf(task: Task): string | null {
  const match = MARKER_RE.exec(task.notes);
  return match?.[1] ?? null;
}

function notesWithMarker(notes: string, todoistId: string): string {
  const body = notes.trim();
  return body === '' ? `todoist:${todoistId}` : `${body}\n\ntodoist:${todoistId}`;
}

// ---------- Completion sync (Todoist → Ariadne, D17) ----------

/** How far back the sync looks for completions (Todoist caps windows at 3 months). */
export const TODOIST_SYNC_LOOKBACK_DAYS = 30;

/** One completed Todoist item, normalized by the main-process service. */
export interface TodoistCompletion {
  todoistId: string;
  /** Completion date (YYYY-MM-DD, already local), or null if Todoist omitted it. */
  completedDate: string | null;
}

export interface TodoistCompletionResult extends MutationResult {
  /** Tasks newly marked Done by this sync. */
  completed: number;
}

/**
 * Mark tasks Done whose `todoist:<id>` marker matches a completed Todoist
 * item. Only open tasks change — Done tasks are already there, and a task the
 * user Dropped in Ariadne stays dropped. Idempotent by construction.
 */
export function applyTodoistCompletions(
  ws: Workspace,
  ctx: MutationCtx,
  completions: readonly TodoistCompletion[],
): TodoistCompletionResult {
  const byId = new Map(completions.map((c) => [c.todoistId, c]));
  let completed = 0;
  const tasks = ws.tasks.map((t) => {
    if (t.status === 'Done' || t.status === 'Dropped') return t;
    const marker = todoistMarkerOf(t);
    if (marker === null) return t;
    const hit = byId.get(marker);
    if (hit === undefined) return t;
    completed += 1;
    return { ...t, status: 'Done' as const, completedAt: hit.completedDate ?? ctx.today };
  });
  if (completed === 0) return { workspace: ws, changed: [], completed };
  return { workspace: { ...ws, tasks }, changed: ['tasks'], completed };
}

/** Whether the scheduled sync should fire now (renderer passes wall-clock ISO). */
export function todoistSyncDue(settings: Settings, nowIso: string): boolean {
  if (settings.todoistSyncEvery === 'manual') return false;
  if (settings.todoistToken.trim() === '') return false;
  if (settings.lastTodoistSyncAt === null) return true;
  const last = Date.parse(settings.lastTodoistSyncAt);
  if (Number.isNaN(last)) return true;
  const intervalMs = settings.todoistSyncEvery === 'hourly' ? 3_600_000 : 86_400_000;
  return Date.parse(nowIso) - last >= intervalMs;
}

// ---------- Push (Ariadne → Todoist) ----------

/** Ariadne priority → Todoist priority number (4 = urgent/p1). */
export const PRIORITY_TO_TODOIST: Record<Task['priority'], number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

/** Todoist labels cannot contain spaces; keep the name readable. */
export function todoistLabelFor(projectName: string): string {
  return projectName
    .trim()
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export interface TodoistPushCandidate {
  taskId: string;
  content: string;
  description: string;
  /** Null for an undated task sent individually; bulk pushes always date. */
  dueDate: string | null;
  /** Todoist priority number, 4 = urgent. */
  priority: number;
  /** Todoist project to file under: the Ariadne category (#Home / #Work). */
  targetProject: 'Home' | 'Work';
  /** Todoist labels: @<project-name-slug> plus @ariadne. */
  labels: string[];
}

function candidateOf(task: Task, project: Project): TodoistPushCandidate {
  return {
    taskId: task.id,
    content: task.title || 'Untitled task',
    description: task.notes,
    dueDate: task.dueDate,
    priority: PRIORITY_TO_TODOIST[task.priority],
    targetProject: project.category === 'home' ? 'Home' : 'Work',
    labels: [todoistLabelFor(project.name), 'ariadne'],
  };
}

/**
 * Open tasks due within the next `days` days (today inclusive) that have not
 * been pushed or imported before (no todoist:<id> marker) and don't live in
 * the Todoist Inbox (those came *from* Todoist).
 */
export function collectTodoistPushCandidates(
  ws: Workspace,
  today: string,
  days: number,
): TodoistPushCandidate[] {
  const projectsById = new Map(ws.projects.map((p) => [p.id, p]));
  const candidates: TodoistPushCandidate[] = [];
  for (const task of ws.tasks) {
    if (task.status === 'Done' || task.status === 'Dropped') continue;
    if (task.projectId === TODOIST_INBOX_ID) continue;
    if (task.dueDate === null) continue;
    if (todoistMarkerOf(task) !== null) continue;
    const distance = dayDiff(task.dueDate, today);
    if (distance < 0 || distance > days) continue;
    const project = projectsById.get(task.projectId);
    if (project === undefined || project.archived === true) continue;
    candidates.push(candidateOf(task, project));
  }
  return candidates.sort((a, b) => {
    const ad = a.dueDate ?? '';
    const bd = b.dueDate ?? '';
    return ad < bd ? -1 : ad > bd ? 1 : 0;
  });
}

export type SingleTaskPushBlock =
  'missing' | 'already-linked' | 'from-todoist' | 'closed' | 'archived-project';

export type SingleTaskPush =
  { ok: true; candidate: TodoistPushCandidate } | { ok: false; reason: SingleTaskPushBlock };

/**
 * Build the push candidate for one explicitly chosen task. Unlike the bulk
 * push there is no due-date window — an undated task is fine — but the same
 * hard rules hold: never re-push a linked task (todoist:<id> marker), never
 * push Todoist's own imports back, and closed tasks / archived projects (D13)
 * stay out.
 */
export function todoistPushCandidateForTask(ws: Workspace, taskId: string): SingleTaskPush {
  const task = ws.tasks.find((t) => t.id === taskId);
  if (task === undefined) return { ok: false, reason: 'missing' };
  if (todoistMarkerOf(task) !== null) return { ok: false, reason: 'already-linked' };
  if (task.projectId === TODOIST_INBOX_ID) return { ok: false, reason: 'from-todoist' };
  if (task.status === 'Done' || task.status === 'Dropped') return { ok: false, reason: 'closed' };
  const project = ws.projects.find((p) => p.id === task.projectId);
  if (project === undefined || project.archived === true) {
    return { ok: false, reason: 'archived-project' };
  }
  return { ok: true, candidate: candidateOf(task, project) };
}

/** Record the created Todoist ids so the tasks are never pushed twice. */
export function markTasksPushed(
  ws: Workspace,
  pushed: readonly { taskId: string; todoistId: string }[],
): MutationResult {
  const byTask = new Map(pushed.map((p) => [p.taskId, p.todoistId]));
  if (byTask.size === 0) return { workspace: ws, changed: [] };
  const tasks = ws.tasks.map((t) => {
    const todoistId = byTask.get(t.id);
    if (todoistId === undefined || todoistMarkerOf(t) !== null) return t;
    return { ...t, notes: notesWithMarker(t.notes, todoistId) };
  });
  if (tasks.every((t, i) => t === ws.tasks[i])) return { workspace: ws, changed: [] };
  return { workspace: { ...ws, tasks }, changed: ['tasks'] };
}
