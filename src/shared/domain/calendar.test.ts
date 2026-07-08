import { describe, expect, it } from 'vitest';

import type { Task } from '../types';

import {
  calendarTasks,
  monthCells,
  monthTitle,
  shiftMonth,
  tasksByDueDate,
  upcomingTasks,
} from './calendar';

const TODAY = '2026-07-08';

let n = 0;
function task(patch: Partial<Task> = {}): Task {
  n += 1;
  return {
    id: patch.id ?? `t${n}`,
    projectId: 'p1',
    title: 'Task',
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

describe('monthTitle / shiftMonth', () => {
  it('formats and pages months across year boundaries', () => {
    expect(monthTitle('2026-07')).toBe('July 2026');
    expect(shiftMonth('2026-07', 1)).toBe('2026-08');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});

describe('monthCells', () => {
  it('lays out July 2026 (starts Wednesday, 31 days, 5 weeks)', () => {
    const cells = monthCells('2026-07');
    expect(cells).toHaveLength(35);
    expect(cells.slice(0, 3)).toEqual([null, null, null]); // Sun-Tue empty
    expect(cells[3]).toBe('2026-07-01');
    expect(cells[33]).toBe('2026-07-31');
    expect(cells[34]).toBeNull();
  });

  it('handles a month starting on Sunday with no leading pad', () => {
    const cells = monthCells('2026-11'); // Nov 1 2026 is a Sunday
    expect(cells[0]).toBe('2026-11-01');
    expect(cells).toHaveLength(35);
  });

  it('handles February in a leap year', () => {
    const cells = monthCells('2028-02'); // 29 days, starts Tuesday
    expect(cells.filter((c) => c !== null)).toHaveLength(29);
  });
});

describe('calendarTasks / tasksByDueDate', () => {
  it('keeps dated non-Dropped tasks (Done included, struck in UI)', () => {
    const list = [
      task({ id: 'a', dueDate: TODAY }),
      task({ id: 'done', dueDate: TODAY, status: 'Done', completedAt: TODAY }),
      task({ id: 'dropped', dueDate: TODAY, status: 'Dropped' }),
      task({ id: 'nodate' }),
    ];
    expect(calendarTasks(list).map((t) => t.id)).toEqual(['a', 'done']);
    expect(
      tasksByDueDate(list)
        .get(TODAY)
        ?.map((t) => t.id),
    ).toEqual(['a', 'done']);
  });
});

describe('upcomingTasks', () => {
  it('returns open dated tasks from today forward, by due, capped', () => {
    const list = [
      task({ id: 'past', dueDate: '2026-07-01' }),
      task({ id: 'today', dueDate: TODAY }),
      task({ id: 'later', dueDate: '2026-07-20' }),
      task({ id: 'soon', dueDate: '2026-07-10' }),
      task({ id: 'done', dueDate: '2026-07-11', status: 'Done', completedAt: TODAY }),
    ];
    expect(upcomingTasks(list, TODAY).map((t) => t.id)).toEqual(['today', 'soon', 'later']);
    expect(upcomingTasks(list, TODAY, 2).map((t) => t.id)).toEqual(['today', 'soon']);
  });
});
