import { describe, expect, it } from 'vitest';

import type { Settings, Task, Workspace } from '../types';
import { DEFAULT_SETTINGS } from '../types';

import type { MutationCtx } from './mutate';
import { seedWorkspace } from './seed';
import {
  applyTodoistCompletions,
  collectTodoistPushCandidates,
  markTasksPushed,
  TODOIST_INBOX_ID,
  todoistLabelFor,
  todoistMarkerOf,
  todoistPushCandidateForTask,
  todoistSyncDue,
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

/** A workspace with a legacy Todoist Inbox project holding one task. */
function withInboxTask(ws: Workspace, task: Partial<Task>): Workspace {
  return {
    ...ws,
    projects: [
      ...ws.projects,
      { ...ws.projects[0]!, id: TODOIST_INBOX_ID, name: 'Todoist Inbox', category: 'home' },
    ],
    tasks: [
      ...ws.tasks,
      {
        ...ws.tasks[0]!,
        id: 'inbox1',
        projectId: TODOIST_INBOX_ID,
        title: 'Call plumber',
        status: 'Todo',
        completedAt: null,
        dueDate: '2026-07-09',
        notes: 'todoist:9001',
        ...task,
      },
    ],
  };
}

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
    // Mark the runbook as already pushed; park one task in the legacy inbox.
    const ws = withInboxTask(seedWorkspace(TODAY), {});
    const marked = markTasksPushed(ws, [
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
    const withInbox = withInboxTask(ws, { notes: '' });
    expect(todoistPushCandidateForTask(withInbox, 'inbox1')).toEqual({
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

describe('applyTodoistCompletions', () => {
  it('marks matching open tasks Done with the Todoist completion date', () => {
    const ws = markTasksPushed(seedWorkspace(TODAY), [
      { taskId: 't6', todoistId: '555' },
      { taskId: 't2', todoistId: '556' },
    ]).workspace;
    const r = applyTodoistCompletions(ws, ctx(), [
      { todoistId: '555', completedDate: '2026-07-07' },
      { todoistId: 'unrelated', completedDate: '2026-07-07' },
    ]);
    expect(r.completed).toBe(1);
    expect(r.changed).toEqual(['tasks']);
    const runbook = r.workspace.tasks.find((t) => t.id === 't6');
    expect(runbook).toMatchObject({ status: 'Done', completedAt: '2026-07-07' });
    // The other pushed task was not completed in Todoist — untouched.
    expect(r.workspace.tasks.find((t) => t.id === 't2')?.status).toBe('Doing');
  });

  it('falls back to today when Todoist omits the completion date', () => {
    const ws = markTasksPushed(seedWorkspace(TODAY), [
      { taskId: 't6', todoistId: '555' },
    ]).workspace;
    const r = applyTodoistCompletions(ws, ctx(), [{ todoistId: '555', completedDate: null }]);
    expect(r.workspace.tasks.find((t) => t.id === 't6')).toMatchObject({
      status: 'Done',
      completedAt: TODAY,
    });
  });

  it('is idempotent and never touches closed tasks', () => {
    const ws = markTasksPushed(seedWorkspace(TODAY), [
      { taskId: 't6', todoistId: '555' },
    ]).workspace;
    const first = applyTodoistCompletions(ws, ctx(), [
      { todoistId: '555', completedDate: '2026-07-07' },
    ]);
    // Same completion again: task is already Done → no-op, same workspace.
    const again = applyTodoistCompletions(first.workspace, ctx(), [
      { todoistId: '555', completedDate: '2026-07-06' },
    ]);
    expect(again.completed).toBe(0);
    expect(again.changed).toEqual([]);
    expect(again.workspace).toBe(first.workspace);
    expect(again.workspace.tasks.find((t) => t.id === 't6')?.completedAt).toBe('2026-07-07');

    // A task Dropped in Ariadne stays dropped even if completed in Todoist.
    const dropped = {
      ...ws,
      tasks: ws.tasks.map((t) =>
        t.id === 't6' ? { ...t, status: 'Dropped' as const, completedAt: null } : t,
      ),
    };
    const r = applyTodoistCompletions(dropped, ctx(), [
      { todoistId: '555', completedDate: '2026-07-07' },
    ]);
    expect(r.completed).toBe(0);
    expect(r.workspace.tasks.find((t) => t.id === 't6')?.status).toBe('Dropped');
  });

  it('also closes legacy inbox tasks completed in Todoist (marker is the join key)', () => {
    const ws = withInboxTask(seedWorkspace(TODAY), {});
    const r = applyTodoistCompletions(ws, ctx(), [
      { todoistId: '9001', completedDate: '2026-07-07' },
    ]);
    expect(r.completed).toBe(1);
    expect(r.workspace.tasks.find((t) => t.id === 'inbox1')?.status).toBe('Done');
  });
});

describe('todoistSyncDue', () => {
  const base: Settings = {
    ...DEFAULT_SETTINGS,
    todoistToken: 'tok',
    todoistSyncEvery: 'hourly',
    lastTodoistSyncAt: '2026-07-08T10:00:00.000Z',
  };
  const NOW = '2026-07-08T10:30:00.000Z';

  it('fires only when the configured interval has elapsed', () => {
    expect(todoistSyncDue(base, NOW)).toBe(false); // 30min < 1h
    expect(todoistSyncDue(base, '2026-07-08T11:00:00.000Z')).toBe(true);
    const daily: Settings = { ...base, todoistSyncEvery: 'daily' };
    expect(todoistSyncDue(daily, '2026-07-08T23:00:00.000Z')).toBe(false);
    expect(todoistSyncDue(daily, '2026-07-09T10:00:00.000Z')).toBe(true);
  });

  it('never fires on manual mode or without a token; fires immediately when unstamped', () => {
    expect(todoistSyncDue({ ...base, todoistSyncEvery: 'manual' }, NOW)).toBe(false);
    expect(todoistSyncDue({ ...base, todoistToken: '  ' }, NOW)).toBe(false);
    expect(todoistSyncDue({ ...base, lastTodoistSyncAt: null }, NOW)).toBe(true);
    expect(todoistSyncDue({ ...base, lastTodoistSyncAt: 'garbage' }, NOW)).toBe(true);
  });
});
