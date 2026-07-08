import type { Task, Workspace } from '../types';

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
