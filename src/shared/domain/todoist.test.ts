import { describe, expect, it } from 'vitest';

import type { MutationCtx } from './mutate';
import { seedWorkspace } from './seed';
import type { TodoistItem } from './todoist';
import { mergeTodoistImport, TODOIST_INBOX_ID, todoistMarkerOf } from './todoist';

const TODAY = '2026-07-08';

function ctx(): MutationCtx {
  let n = 0;
  return {
    today: TODAY,
    newId: () => {
      n += 1;
      return `td${n}`;
    },
  };
}

const item = (patch: Partial<TodoistItem> = {}): TodoistItem => ({
  todoistId: '9001',
  title: 'Call plumber',
  dueDate: '2026-07-09',
  priority: 'High',
  notes: '',
  ...patch,
});

describe('mergeTodoistImport', () => {
  it('creates the Todoist Inbox project on first import', () => {
    const r = mergeTodoistImport(seedWorkspace(TODAY), ctx(), [item()]);
    expect(r.projectCreated).toBe(true);
    expect(r.added).toBe(1);
    expect(r.changed).toEqual(['projects', 'tasks']);
    const inbox = r.workspace.projects.find((p) => p.id === TODOIST_INBOX_ID);
    expect(inbox).toMatchObject({ name: 'Todoist Inbox', category: 'home', tags: ['todoist'] });
    const task = r.workspace.tasks.find((t) => t.projectId === TODOIST_INBOX_ID);
    expect(task).toMatchObject({
      title: 'Call plumber',
      status: 'Todo',
      priority: 'High',
      dueDate: '2026-07-09',
      tags: ['todoist'],
    });
    expect(todoistMarkerOf(task!)).toBe('9001');
  });

  it('preserves description notes above the marker', () => {
    const r = mergeTodoistImport(seedWorkspace(TODAY), ctx(), [
      item({ notes: 'Kitchen sink, not bathroom' }),
    ]);
    const task = r.workspace.tasks.find((t) => t.projectId === TODOIST_INBOX_ID);
    expect(task?.notes).toBe('Kitchen sink, not bathroom\n\ntodoist:9001');
  });

  it('re-import is idempotent and updates open tasks whose schedule moved', () => {
    const first = mergeTodoistImport(seedWorkspace(TODAY), ctx(), [item()]);
    const again = mergeTodoistImport(first.workspace, ctx(), [item()]);
    expect(again.added).toBe(0);
    expect(again.updated).toBe(0);
    expect(again.changed).toEqual([]);
    expect(again.workspace).toBe(first.workspace);

    const moved = mergeTodoistImport(first.workspace, ctx(), [
      item({ dueDate: '2026-07-12', priority: 'Critical' }),
    ]);
    expect(moved.updated).toBe(1);
    expect(moved.added).toBe(0);
    const task = moved.workspace.tasks.find((t) => todoistMarkerOf(t) === '9001');
    expect(task).toMatchObject({ dueDate: '2026-07-12', priority: 'Critical' });
  });

  it('never resurrects or edits completed imports', () => {
    const first = mergeTodoistImport(seedWorkspace(TODAY), ctx(), [item()]);
    const done = {
      ...first.workspace,
      tasks: first.workspace.tasks.map((t) =>
        todoistMarkerOf(t) === '9001' ? { ...t, status: 'Done' as const, completedAt: TODAY } : t,
      ),
    };
    const again = mergeTodoistImport(done, ctx(), [item({ dueDate: '2026-08-01' })]);
    expect(again.updated).toBe(0);
    expect(again.added).toBe(0);
    const task = again.workspace.tasks.find((t) => todoistMarkerOf(t) === '9001');
    expect(task?.status).toBe('Done');
    expect(task?.dueDate).toBe('2026-07-09');
  });

  it('imports several items in one pass', () => {
    const r = mergeTodoistImport(seedWorkspace(TODAY), ctx(), [
      item(),
      item({ todoistId: '9002', title: 'Renew registration', dueDate: null, priority: 'Low' }),
    ]);
    expect(r.added).toBe(2);
    expect(r.workspace.tasks.filter((t) => t.projectId === TODOIST_INBOX_ID)).toHaveLength(2);
  });

  it('does not recreate an existing inbox', () => {
    const first = mergeTodoistImport(seedWorkspace(TODAY), ctx(), [item()]);
    const r = mergeTodoistImport(first.workspace, ctx(), [item({ todoistId: '9002' })]);
    expect(r.projectCreated).toBe(false);
    expect(r.changed).toEqual(['tasks']);
  });
});
