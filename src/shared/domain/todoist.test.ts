import { describe, expect, it } from 'vitest';

import type { MutationCtx } from './mutate';
import { seedWorkspace } from './seed';
import type { TodoistItem } from './todoist';
import {
  collectTodoistPushCandidates,
  markTasksPushed,
  mergeTodoistImport,
  TODOIST_INBOX_ID,
  todoistLabelFor,
  todoistMarkerOf,
  todoistPushCandidateForTask,
} from './todoist';

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

describe('todoistLabelFor', () => {
  it('slugs project names into valid Todoist labels', () => {
    expect(todoistLabelFor('Q3 Platform Migration')).toBe('Q3-Platform-Migration');
    expect(todoistLabelFor('Hiring: Senior Engineer')).toBe('Hiring-Senior-Engineer');
    expect(todoistLabelFor('  spaced  out  ')).toBe('spaced-out');
    expect(todoistLabelFor('x'.repeat(80))).toHaveLength(60);
  });
});

describe('collectTodoistPushCandidates', () => {
  it('selects open dated tasks in the window with category project and labels', () => {
    const ws = seedWorkspace(TODAY);
    const candidates = collectTodoistPushCandidates(ws, TODAY, 2);
    // Due 0..2d in seed: runbook(0), wireframes(0), cluster(+2), cat6(+2),
    // categorize(+1), screen candidates(+1). Sorted by due date.
    expect(candidates).toHaveLength(6);
    expect((candidates[0]?.dueDate ?? '') <= (candidates[5]?.dueDate ?? '')).toBe(true);

    const runbook = candidates.find((c) => c.content === 'Write migration runbook');
    expect(runbook).toMatchObject({
      targetProject: 'Work',
      priority: 2, // Medium
      labels: ['Q3-Platform-Migration', 'ariadne'],
      dueDate: TODAY,
    });
    const cat6 = candidates.find((c) => c.content === 'Run cat6 to office');
    expect(cat6).toMatchObject({
      targetProject: 'Home',
      labels: ['Home-network-upgrade', 'ariadne'],
    });
  });

  it('excludes overdue, far-future, closed, undated, inbox, and already-marked tasks', () => {
    const ws = seedWorkspace(TODAY);
    // Mark the runbook as already pushed; move one task to the inbox.
    const imported = mergeTodoistImport(ws, ctx(), [item()]); // inbox task, due +1d
    const marked = markTasksPushed(imported.workspace, [
      { taskId: 't6', todoistId: 'existing' }, // runbook
    ]);
    const candidates = collectTodoistPushCandidates(marked.workspace, TODAY, 2);
    const titles = candidates.map((c) => c.content);
    expect(titles).not.toContain('Write migration runbook'); // marked
    expect(titles).not.toContain('Call plumber'); // inbox import
    expect(titles).not.toContain('Migrate auth service'); // overdue (-1d)
    expect(titles).not.toContain('Migrate billing service'); // +9d, outside window
    // Critical maps to Todoist 4.
    const cats = collectTodoistPushCandidates(marked.workspace, TODAY, 4);
    const accountant = cats.find((c) => c.content === 'Meet with accountant');
    expect(accountant?.priority).toBe(4);
  });

  it('never pushes tasks from archived projects', () => {
    const ws = seedWorkspace(TODAY);
    const before = collectTodoistPushCandidates(ws, TODAY, 2);
    expect(before.some((c) => c.labels.includes('Q3-Platform-Migration'))).toBe(true);
    ws.projects = ws.projects.map((p) => (p.id === 'p1' ? { ...p, archived: true } : p));
    const after = collectTodoistPushCandidates(ws, TODAY, 2);
    expect(after.some((c) => c.labels.includes('Q3-Platform-Migration'))).toBe(false);
  });

  it('titles empty tasks "Untitled task"', () => {
    const ws = seedWorkspace(TODAY);
    ws.tasks = [
      {
        ...ws.tasks[0]!,
        id: 'x',
        title: '',
        status: 'Todo',
        completedAt: null,
        dueDate: TODAY,
        notes: '',
      },
    ];
    const candidates = collectTodoistPushCandidates(ws, TODAY, 1);
    expect(candidates[0]?.content).toBe('Untitled task');
  });
});

describe('todoistPushCandidateForTask', () => {
  it('builds a candidate for an open task with category project and labels', () => {
    const r = todoistPushCandidateForTask(seedWorkspace(TODAY), 't6');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.candidate).toMatchObject({
      taskId: 't6',
      content: 'Write migration runbook',
      dueDate: TODAY,
      priority: 2, // Medium
      targetProject: 'Work',
      labels: ['Q3-Platform-Migration', 'ariadne'],
    });
  });

  it('has no due-date window: undated and overdue tasks are pushable', () => {
    const ws = seedWorkspace(TODAY);
    // t3 "Migrate auth service" is overdue (-1d) — excluded from the bulk
    // push, but an explicit single send is allowed.
    const overdue = todoistPushCandidateForTask(ws, 't3');
    expect(overdue.ok).toBe(true);

    ws.tasks = ws.tasks.map((t) => (t.id === 't3' ? { ...t, dueDate: null } : t));
    const undated = todoistPushCandidateForTask(ws, 't3');
    expect(undated.ok).toBe(true);
    if (undated.ok) expect(undated.candidate.dueDate).toBeNull();
  });

  it('blocks already-linked tasks, Todoist imports, closed tasks, and archived projects', () => {
    const ws = seedWorkspace(TODAY);

    const marked = markTasksPushed(ws, [{ taskId: 't6', todoistId: '555' }]).workspace;
    expect(todoistPushCandidateForTask(marked, 't6')).toEqual({
      ok: false,
      reason: 'already-linked',
    });

    // An unmarked task living in the Todoist Inbox never goes back.
    const imported = mergeTodoistImport(ws, ctx(), [item()]).workspace;
    const inboxTask = imported.tasks.find((t) => t.projectId === TODOIST_INBOX_ID);
    const stripped = {
      ...imported,
      tasks: imported.tasks.map((t) => (t.id === inboxTask?.id ? { ...t, notes: '' } : t)),
    };
    expect(todoistPushCandidateForTask(stripped, inboxTask?.id ?? '')).toEqual({
      ok: false,
      reason: 'from-todoist',
    });

    // t1 "Audit legacy service dependencies" is Done.
    expect(todoistPushCandidateForTask(ws, 't1')).toEqual({ ok: false, reason: 'closed' });

    const archived = {
      ...ws,
      projects: ws.projects.map((p) => (p.id === 'p1' ? { ...p, archived: true } : p)),
    };
    expect(todoistPushCandidateForTask(archived, 't6')).toEqual({
      ok: false,
      reason: 'archived-project',
    });

    expect(todoistPushCandidateForTask(ws, 'ghost')).toEqual({ ok: false, reason: 'missing' });
  });
});

describe('markTasksPushed', () => {
  it('appends markers, preserving notes, and never double-marks', () => {
    const ws = seedWorkspace(TODAY);
    const r = markTasksPushed(ws, [{ taskId: 't6', todoistId: '555' }]);
    expect(r.changed).toEqual(['tasks']);
    const runbook = r.workspace.tasks.find((t) => t.id === 't6');
    expect(todoistMarkerOf(runbook!)).toBe('555');

    const again = markTasksPushed(r.workspace, [{ taskId: 't6', todoistId: '999' }]);
    expect(again.changed).toEqual([]);
    expect(todoistMarkerOf(again.workspace.tasks.find((t) => t.id === 't6')!)).toBe('555');
  });

  it('is a no-op for empty or unknown ids', () => {
    const ws = seedWorkspace(TODAY);
    expect(markTasksPushed(ws, []).changed).toEqual([]);
    expect(markTasksPushed(ws, [{ taskId: 'ghost', todoistId: '1' }]).changed).toEqual([]);
  });
});
