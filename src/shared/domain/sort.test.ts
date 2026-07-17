import { describe, expect, it } from 'vitest';

import type { Task } from '../types';

import { byDue, byProjectListOrder, inPinnedOrder } from './sort';

function task(patch: Partial<Task>): Task {
  return {
    id: 'x',
    projectId: 'p1',
    title: '',
    status: 'Todo',
    priority: 'Medium',
    tags: [],
    notes: '',
    dueDate: null,
    dependsOn: [],
    subtasks: [],
    links: [],
    createdAt: '2026-06-01',
    completedAt: null,
    ...patch,
  };
}

describe('byDue', () => {
  it('sorts ascending with null due dates last', () => {
    const list = [
      task({ id: 'none', dueDate: null }),
      task({ id: 'late', dueDate: '2026-08-01' }),
      task({ id: 'soon', dueDate: '2026-07-09' }),
    ];
    expect([...list].sort(byDue).map((t) => t.id)).toEqual(['soon', 'late', 'none']);
  });

  it('is stable for equal keys', () => {
    const a = task({ id: 'a', dueDate: '2026-07-09' });
    const b = task({ id: 'b', dueDate: '2026-07-09' });
    expect(byDue(a, b)).toBe(0);
  });
});

describe('byProjectListOrder', () => {
  it('orders Doing → Todo → Waiting → Done → Dropped, then by due', () => {
    const list = [
      task({ id: 'dropped', status: 'Dropped' }),
      task({ id: 'done', status: 'Done' }),
      task({ id: 'todo-late', status: 'Todo', dueDate: '2026-08-01' }),
      task({ id: 'waiting', status: 'Waiting' }),
      task({ id: 'todo-soon', status: 'Todo', dueDate: '2026-07-09' }),
      task({ id: 'doing', status: 'Doing' }),
    ];
    expect([...list].sort(byProjectListOrder).map((t) => t.id)).toEqual([
      'doing',
      'todo-soon',
      'todo-late',
      'waiting',
      'done',
      'dropped',
    ]);
  });
});

describe('inPinnedOrder', () => {
  it('keeps the pinned order even when statuses change', () => {
    const list = [
      task({ id: 'a', status: 'Done' }), // was Doing when pinned first
      task({ id: 'b', status: 'Todo' }),
      task({ id: 'c', status: 'Doing' }),
    ];
    expect(inPinnedOrder(list, ['a', 'b', 'c']).map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('appends tasks that are not pinned yet, in workspace order', () => {
    const list = [task({ id: 'new2' }), task({ id: 'b' }), task({ id: 'new1' }), task({ id: 'a' })];
    expect(inPinnedOrder(list, ['a', 'b']).map((t) => t.id)).toEqual(['a', 'b', 'new2', 'new1']);
  });

  it('drops pinned ids whose tasks are gone', () => {
    const list = [task({ id: 'b' })];
    expect(inPinnedOrder(list, ['deleted', 'b']).map((t) => t.id)).toEqual(['b']);
  });
});
