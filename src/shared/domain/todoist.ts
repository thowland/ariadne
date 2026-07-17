import type { Task, Workspace } from '../types';

import { dayDiff } from './dates';
import type { MutationCtx, MutationResult } from './mutate';

/**
 * One-way Todoist import (spec §9): fetched items merge into a dedicated
 * "Todoist Inbox" project. Dedupe is by the Todoist task id recorded as a
 * `todoist:<id>` marker line in the task notes; re-imports update the due
 * date/priority of previously imported, still-open tasks and never delete.
 */

export const TODOIST_INBOX_ID = 'todoist-inbox';

/** Normalized item produced by the main-process TodoistService. */
export interface TodoistItem {
  todoistId: string;
  title: string;
  dueDate: string | null;
  priority: Task['priority'];
  notes: string;
}

const MARKER_RE = /^todoist:(\S+)$/m;

export function todoistMarkerOf(task: Task): string | null {
  const match = MARKER_RE.exec(task.notes);
  return match?.[1] ?? null;
}

function notesWithMarker(notes: string, todoistId: string): string {
  const body = notes.trim();
  return body === '' ? `todoist:${todoistId}` : `${body}\n\ntodoist:${todoistId}`;
}

export interface TodoistMergeResult extends MutationResult {
  added: number;
  updated: number;
  projectCreated: boolean;
}

export function mergeTodoistImport(
  ws: Workspace,
  ctx: MutationCtx,
  items: readonly TodoistItem[],
): TodoistMergeResult {
  let projects = ws.projects;
  let projectCreated = false;
  if (!projects.some((p) => p.id === TODOIST_INBOX_ID)) {
    projectCreated = true;
    projects = [
      ...projects,
      {
        id: TODOIST_INBOX_ID,
        name: 'Todoist Inbox',
        category: 'home',
        tags: ['todoist'],
        color: '#c2569b',
        status: 'Active',
        notes: 'Tasks imported from Todoist.',
        links: [],
        createdAt: ctx.today,
      },
    ];
  }

  const byMarker = new Map<string, Task>();
  for (const t of ws.tasks) {
    if (t.projectId !== TODOIST_INBOX_ID) continue;
    const marker = todoistMarkerOf(t);
    if (marker !== null) byMarker.set(marker, t);
  }

  let added = 0;
  let updated = 0;
  let tasks = ws.tasks;

  for (const item of items) {
    const existing = byMarker.get(item.todoistId);
    if (existing !== undefined) {
      // Update still-open imports whose schedule/priority moved in Todoist.
      const open = existing.status !== 'Done' && existing.status !== 'Dropped';
      const changed = existing.dueDate !== item.dueDate || existing.priority !== item.priority;
      if (open && changed) {
        tasks = tasks.map((t) =>
          t.id === existing.id ? { ...t, dueDate: item.dueDate, priority: item.priority } : t,
        );
        updated += 1;
      }
      continue;
    }
    tasks = [
      ...tasks,
      {
        id: ctx.newId(),
        projectId: TODOIST_INBOX_ID,
        title: item.title,
        status: 'Todo',
        priority: item.priority,
        tags: ['todoist'],
        notes: notesWithMarker(item.notes, item.todoistId),
        dueDate: item.dueDate,
        dependsOn: [],
        subtasks: [],
        links: [],
        createdAt: ctx.today,
        completedAt: null,
      },
    ];
    added += 1;
  }

  const changed: MutationResult['changed'] = [];
  if (projectCreated) changed.push('projects');
  if (added > 0 || updated > 0) changed.push('tasks');

  return {
    workspace: changed.length > 0 ? { ...ws, projects, tasks } : ws,
    changed,
    added,
    updated,
    projectCreated,
  };
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
  dueDate: string;
  /** Todoist priority number, 4 = urgent. */
  priority: number;
  /** Todoist project to file under: the Ariadne category (#Home / #Work). */
  targetProject: 'Home' | 'Work';
  /** Todoist labels: @<project-name-slug> plus @ariadne. */
  labels: string[];
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
    candidates.push({
      taskId: task.id,
      content: task.title || 'Untitled task',
      description: task.notes,
      dueDate: task.dueDate,
      priority: PRIORITY_TO_TODOIST[task.priority],
      targetProject: project.category === 'home' ? 'Home' : 'Work',
      labels: [todoistLabelFor(project.name), 'ariadne'],
    });
  }
  return candidates.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
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
