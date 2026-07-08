import { describe, expect, it } from 'vitest';

import type { Project, Task } from '../types';

import {
  allProjectTags,
  indexTasks,
  isBlocked,
  isDueThisWeek,
  isDueToday,
  isDueWithinWeek,
  isHighLater,
  isOpen,
  isOverdue,
  nextDueTask,
  projectProgress,
  projectsInScope,
  relativeDueLabel,
  tasksInScope,
} from './derive';

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

function project(patch: Partial<Project> = {}): Project {
  n += 1;
  return {
    id: patch.id ?? `p${n}`,
    name: 'Project',
    category: 'work',
    tags: [],
    color: '#4f5bd5',
    status: 'Active',
    notes: '',
    links: [],
    createdAt: '2026-06-01',
    ...patch,
  };
}

describe('isOpen', () => {
  it('is true for Todo/Doing/Waiting, false for Done/Dropped', () => {
    expect(isOpen(task({ status: 'Todo' }))).toBe(true);
    expect(isOpen(task({ status: 'Doing' }))).toBe(true);
    expect(isOpen(task({ status: 'Waiting' }))).toBe(true);
    expect(isOpen(task({ status: 'Done' }))).toBe(false);
    expect(isOpen(task({ status: 'Dropped' }))).toBe(false);
  });
});

describe('isOverdue / isDueToday / due-week windows', () => {
  it('overdue = open with dueDate strictly before today', () => {
    expect(isOverdue(task({ dueDate: '2026-07-07' }), TODAY)).toBe(true);
    expect(isOverdue(task({ dueDate: TODAY }), TODAY)).toBe(false);
    expect(isOverdue(task({ dueDate: null }), TODAY)).toBe(false);
    expect(isOverdue(task({ dueDate: '2026-07-01', status: 'Done' }), TODAY)).toBe(false);
    expect(isOverdue(task({ dueDate: '2026-07-01', status: 'Dropped' }), TODAY)).toBe(false);
  });

  it('due today', () => {
    expect(isDueToday(task({ dueDate: TODAY }), TODAY)).toBe(true);
    expect(isDueToday(task({ dueDate: '2026-07-09' }), TODAY)).toBe(false);
    expect(isDueToday(task({ dueDate: TODAY, status: 'Done' }), TODAY)).toBe(false);
  });

  it('isDueThisWeek covers days 1..7 only', () => {
    expect(isDueThisWeek(task({ dueDate: TODAY }), TODAY)).toBe(false);
    expect(isDueThisWeek(task({ dueDate: '2026-07-09' }), TODAY)).toBe(true);
    expect(isDueThisWeek(task({ dueDate: '2026-07-15' }), TODAY)).toBe(true);
    expect(isDueThisWeek(task({ dueDate: '2026-07-16' }), TODAY)).toBe(false);
    expect(isDueThisWeek(task({ dueDate: '2026-07-07' }), TODAY)).toBe(false);
    expect(isDueThisWeek(task({ dueDate: null }), TODAY)).toBe(false);
  });

  it('isDueWithinWeek covers days 0..7 (stat card window)', () => {
    expect(isDueWithinWeek(task({ dueDate: TODAY }), TODAY)).toBe(true);
    expect(isDueWithinWeek(task({ dueDate: '2026-07-15' }), TODAY)).toBe(true);
    expect(isDueWithinWeek(task({ dueDate: '2026-07-16' }), TODAY)).toBe(false);
    expect(isDueWithinWeek(task({ dueDate: '2026-07-07' }), TODAY)).toBe(false);
  });
});

describe('isBlocked', () => {
  it('open task with an open dependency is blocked', () => {
    const dep = task({ id: 'dep', status: 'Doing' });
    const t = task({ dependsOn: ['dep'] });
    expect(isBlocked(t, indexTasks([dep, t]))).toBe(true);
  });

  it('completed or dropped dependencies do not block', () => {
    const done = task({ id: 'done', status: 'Done', completedAt: TODAY });
    const dropped = task({ id: 'dropped', status: 'Dropped' });
    const t = task({ dependsOn: ['done', 'dropped'] });
    expect(isBlocked(t, indexTasks([done, dropped, t]))).toBe(false);
  });

  it('missing dependency ids do not block', () => {
    const t = task({ dependsOn: ['ghost'] });
    expect(isBlocked(t, indexTasks([t]))).toBe(false);
  });

  it('done/dropped tasks are never blocked', () => {
    const dep = task({ id: 'dep', status: 'Todo' });
    const t = task({ dependsOn: ['dep'], status: 'Done', completedAt: TODAY });
    expect(isBlocked(t, indexTasks([dep, t]))).toBe(false);
  });

  it('tolerates dependency cycles', () => {
    const a = task({ id: 'a', dependsOn: ['b'] });
    const b = task({ id: 'b', dependsOn: ['a'] });
    const byId = indexTasks([a, b]);
    expect(isBlocked(a, byId)).toBe(true);
    expect(isBlocked(b, byId)).toBe(true);
  });
});

describe('isHighLater', () => {
  it('critical/high with no due pressure inside the week', () => {
    expect(isHighLater(task({ priority: 'Critical', dueDate: null }), TODAY)).toBe(true);
    expect(isHighLater(task({ priority: 'High', dueDate: '2026-07-20' }), TODAY)).toBe(true);
  });

  it('excludes tasks due within 7 days and overdue tasks', () => {
    expect(isHighLater(task({ priority: 'Critical', dueDate: TODAY }), TODAY)).toBe(false);
    expect(isHighLater(task({ priority: 'High', dueDate: '2026-07-15' }), TODAY)).toBe(false);
    expect(isHighLater(task({ priority: 'Critical', dueDate: '2026-07-01' }), TODAY)).toBe(false);
  });

  it('excludes medium/low priorities and closed tasks', () => {
    expect(isHighLater(task({ priority: 'Medium', dueDate: null }), TODAY)).toBe(false);
    expect(isHighLater(task({ priority: 'High', status: 'Done', completedAt: TODAY }), TODAY)).toBe(
      false,
    );
  });
});

describe('projectProgress', () => {
  it('done / total excluding Dropped', () => {
    const tasks = [
      task({ status: 'Done', completedAt: TODAY }),
      task({ status: 'Todo' }),
      task({ status: 'Dropped' }),
      task({ status: 'Done', completedAt: TODAY }),
    ];
    expect(projectProgress(tasks)).toBeCloseTo(2 / 3);
  });

  it('is 0 with no tasks or only dropped tasks', () => {
    expect(projectProgress([])).toBe(0);
    expect(projectProgress([task({ status: 'Dropped' })])).toBe(0);
  });
});

describe('relativeDueLabel', () => {
  it('matches the prototype label set', () => {
    expect(relativeDueLabel('2026-07-05', TODAY)).toEqual({
      text: '3d overdue',
      color: '#d94c3a',
    });
    expect(relativeDueLabel(TODAY, TODAY).text).toBe('Today');
    expect(relativeDueLabel('2026-07-09', TODAY).text).toBe('Tomorrow');
    expect(relativeDueLabel('2026-07-12', TODAY).text).toBe('in 4d');
    expect(relativeDueLabel('2026-07-15', TODAY).text).toBe('in 7d');
    expect(relativeDueLabel('2026-07-16', TODAY).text).toBe('Jul 16');
    expect(relativeDueLabel(null, TODAY).text).toBe('');
  });
});

describe('nextDueTask', () => {
  it('returns the open task with the earliest due date', () => {
    const soon = task({ id: 'soon', dueDate: '2026-07-10' });
    const later = task({ id: 'later', dueDate: '2026-08-01' });
    const doneEarlier = task({ id: 'done', dueDate: '2026-07-01', status: 'Done' });
    const noDue = task({ id: 'nodue' });
    expect(nextDueTask([later, noDue, soon, doneEarlier])?.id).toBe('soon');
  });

  it('returns null when nothing qualifies', () => {
    expect(nextDueTask([task({ status: 'Done' }), task()])).toBeNull();
  });
});

describe('scope filtering', () => {
  const work = project({ id: 'w', category: 'work' });
  const home = project({ id: 'h', category: 'home' });
  const tw = task({ id: 'tw', projectId: 'w' });
  const th = task({ id: 'th', projectId: 'h' });

  it('projectsInScope', () => {
    expect(projectsInScope([work, home], 'all')).toHaveLength(2);
    expect(projectsInScope([work, home], 'work')).toEqual([work]);
    expect(projectsInScope([work, home], 'home')).toEqual([home]);
  });

  it('tasksInScope follows the parent project category', () => {
    expect(tasksInScope([tw, th], [work, home], 'all')).toHaveLength(2);
    expect(tasksInScope([tw, th], [work, home], 'work')).toEqual([tw]);
    expect(tasksInScope([tw, th], [work, home], 'home')).toEqual([th]);
  });
});

describe('allProjectTags', () => {
  it('collects distinct tags sorted', () => {
    const ps = [project({ tags: ['infra', 'q3'] }), project({ tags: ['q3', 'aaa'] })];
    expect(allProjectTags(ps)).toEqual(['aaa', 'infra', 'q3']);
  });
});
