import { describe, expect, it } from 'vitest';

import type { Project, Task } from '../types';

import {
  allProjectTags,
  badgeCount,
  duePressure,
  indexTasks,
  isArchived,
  isBlocked,
  isDueThisWeek,
  isDueToday,
  isDueWithinWeek,
  isHighLater,
  isOpen,
  isOverdue,
  nextDueTask,
  overdueDependency,
  projectProgress,
  projectsInScope,
  relativeDueLabel,
  statusComposition,
  taskDueLabel,
  tasksInScope,
  weeklyCompletionCounts,
} from './derive';
import { seedWorkspace } from './seed';

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

  it('isDueThisWeek runs from tomorrow through Saturday (Sun–Sat weeks, D15)', () => {
    // TODAY is Wed 2026-07-08; the week ends Sat 2026-07-11.
    expect(isDueThisWeek(task({ dueDate: TODAY }), TODAY)).toBe(false);
    expect(isDueThisWeek(task({ dueDate: '2026-07-09' }), TODAY)).toBe(true);
    expect(isDueThisWeek(task({ dueDate: '2026-07-11' }), TODAY)).toBe(true);
    expect(isDueThisWeek(task({ dueDate: '2026-07-12' }), TODAY)).toBe(false); // next Sunday
    expect(isDueThisWeek(task({ dueDate: '2026-07-07' }), TODAY)).toBe(false);
    expect(isDueThisWeek(task({ dueDate: null }), TODAY)).toBe(false);
  });

  it('isDueWithinWeek covers today through Saturday (stat card window, D15)', () => {
    expect(isDueWithinWeek(task({ dueDate: TODAY }), TODAY)).toBe(true);
    expect(isDueWithinWeek(task({ dueDate: '2026-07-11' }), TODAY)).toBe(true); // Saturday
    expect(isDueWithinWeek(task({ dueDate: '2026-07-12' }), TODAY)).toBe(false); // next Sunday
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

  it('excludes tasks due inside the current week and overdue tasks', () => {
    expect(isHighLater(task({ priority: 'Critical', dueDate: TODAY }), TODAY)).toBe(false);
    expect(isHighLater(task({ priority: 'High', dueDate: '2026-07-11' }), TODAY)).toBe(false);
    expect(isHighLater(task({ priority: 'Critical', dueDate: '2026-07-01' }), TODAY)).toBe(false);
    // Due next Sunday: outside the Sun–Sat week → high-later, not due-this-week.
    expect(isHighLater(task({ priority: 'High', dueDate: '2026-07-12' }), TODAY)).toBe(true);
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

describe('taskDueLabel', () => {
  it('matches relativeDueLabel for open tasks', () => {
    expect(taskDueLabel(task({ dueDate: '2026-07-05' }), TODAY)).toEqual({
      text: '3d overdue',
      color: '#d94c3a',
    });
    expect(taskDueLabel(task({ dueDate: TODAY }), TODAY).text).toBe('Today');
  });

  it('never reads Done/Dropped tasks as overdue — neutral date instead', () => {
    expect(
      taskDueLabel(task({ dueDate: '2026-07-05', status: 'Done', completedAt: TODAY }), TODAY),
    ).toEqual({ text: 'Jul 5', color: '#9a9a92' });
    expect(taskDueLabel(task({ dueDate: '2026-07-05', status: 'Dropped' }), TODAY).text).toBe(
      'Jul 5',
    );
    expect(
      taskDueLabel(task({ dueDate: null, status: 'Done', completedAt: TODAY }), TODAY).text,
    ).toBe('');
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

  it('archived projects and their tasks are out of every scope', () => {
    const parked = project({ id: 'a', category: 'work', archived: true });
    const ta = task({ id: 'ta', projectId: 'a' });
    expect(isArchived(parked)).toBe(true);
    expect(isArchived(work)).toBe(false);
    expect(projectsInScope([work, parked], 'all')).toEqual([work]);
    expect(projectsInScope([work, parked], 'work')).toEqual([work]);
    expect(tasksInScope([tw, ta], [work, parked], 'all')).toEqual([tw]);
  });
});

describe('allProjectTags', () => {
  it('collects distinct tags sorted', () => {
    const ps = [project({ tags: ['infra', 'q3'] }), project({ tags: ['q3', 'aaa'] })];
    expect(allProjectTags(ps)).toEqual(['aaa', 'infra', 'q3']);
  });
});

describe('overdueDependency', () => {
  it('returns the first directly-overdue open dependency', () => {
    const late = task({ id: 'late', dueDate: '2026-07-01' });
    const fine = task({ id: 'fine', dueDate: '2026-07-20' });
    const t = task({ dependsOn: ['fine', 'late'] });
    expect(overdueDependency(t, indexTasks([late, fine, t]), TODAY)?.id).toBe('late');
  });

  it('is not transitive and ignores closed/undated/missing deps', () => {
    const late = task({ id: 'late', dueDate: '2026-07-01' });
    const middle = task({ id: 'middle', dependsOn: ['late'] });
    const end = task({ id: 'end', dependsOn: ['middle'] });
    const byId = indexTasks([late, middle, end]);
    expect(overdueDependency(middle, byId, TODAY)?.id).toBe('late');
    expect(overdueDependency(end, byId, TODAY)).toBeNull(); // one hop only

    const doneLate = task({ id: 'dl', dueDate: '2026-07-01', status: 'Done', completedAt: TODAY });
    const t = task({ dependsOn: ['dl', 'ghost'] });
    expect(overdueDependency(t, indexTasks([doneLate, t]), TODAY)).toBeNull();
  });

  it('closed tasks are never at risk themselves', () => {
    const late = task({ id: 'late', dueDate: '2026-07-01' });
    const t = task({ dependsOn: ['late'], status: 'Dropped' });
    expect(overdueDependency(t, indexTasks([late, t]), TODAY)).toBeNull();
  });
});

describe('project-card visualizations', () => {
  it('weeklyCompletionCounts buckets the last 8 Sun–Sat weeks, oldest first', () => {
    const tasks = [
      task({ status: 'Done', completedAt: '2026-07-06' }), // current week (Mon)
      task({ status: 'Done', completedAt: '2026-07-04' }), // last week (Sat)
      task({ status: 'Done', completedAt: '2026-06-28' }), // last week (Sun)
      task({ status: 'Done', completedAt: '2026-05-20' }), // 7 weeks back
      task({ status: 'Done', completedAt: '2026-04-01' }), // out of window
      task({ status: 'Todo' }), // never counted
    ];
    const points = weeklyCompletionCounts(tasks, TODAY);
    expect(points).toHaveLength(8);
    expect(points[0]?.start).toBe('2026-05-17'); // 7 weeks before this week's Sunday
    expect(points[7]?.start).toBe('2026-07-05'); // current week
    expect(points.map((p) => p.count)).toEqual([1, 0, 0, 0, 0, 0, 2, 1]);
  });

  it('statusComposition splits blocked out of Todo/Waiting and drops Dropped', () => {
    const dep = task({ id: 'dep', status: 'Doing' });
    const list = [
      dep,
      task({ status: 'Done', completedAt: TODAY }),
      task({ status: 'Todo', dependsOn: ['dep'] }), // blocked
      task({ status: 'Waiting', dependsOn: ['dep'] }), // blocked
      task({ status: 'Waiting' }),
      task({ status: 'Todo' }),
      task({ status: 'Dropped' }),
    ];
    expect(statusComposition(list, indexTasks(list))).toEqual({
      done: 1,
      doing: 1,
      blocked: 2,
      waiting: 1,
      todo: 1,
      total: 6,
    });
  });

  it('duePressure pools overdue and counts open tasks per current-week day', () => {
    const tasks = [
      task({ dueDate: '2026-07-01' }), // overdue (last week)
      task({ dueDate: '2026-07-06' }), // overdue (this week, Monday, still open)
      task({ dueDate: TODAY }),
      task({ dueDate: '2026-07-09' }),
      task({ dueDate: '2026-07-09', status: 'Done', completedAt: TODAY }), // closed → not due
      task({ dueDate: '2026-07-12' }), // next week → outside the strip
    ];
    const p = duePressure(tasks, TODAY);
    expect(p.overdue).toBe(2);
    expect(p.days.map((d) => d.date)).toEqual([
      '2026-07-05',
      '2026-07-06',
      '2026-07-07',
      '2026-07-08',
      '2026-07-09',
      '2026-07-10',
      '2026-07-11',
    ]);
    // The open Monday task counts on its cell AND in the overdue pool.
    expect(p.days.map((d) => d.count)).toEqual([0, 1, 0, 1, 1, 0, 0]);
  });
});

describe('badgeCount (D28)', () => {
  const ws = seedWorkspace(TODAY);
  const withMode = (badgeMode: 'none' | 'due' | 'overdue') => ({
    ...ws,
    settings: { ...ws.settings, badgeMode },
  });

  it('is 0 when the badge is off, whatever is due', () => {
    expect(badgeCount(withMode('none'), TODAY)).toBe(0);
  });

  it('counts overdue tasks', () => {
    expect(badgeCount(withMode('overdue'), TODAY)).toBe(
      ws.tasks.filter((t) => isOverdue(t, TODAY)).length,
    );
    expect(badgeCount(withMode('overdue'), TODAY)).toBeGreaterThan(0);
  });

  it('counts tasks due today', () => {
    expect(badgeCount(withMode('due'), TODAY)).toBe(
      ws.tasks.filter((t) => isDueToday(t, TODAY)).length,
    );
  });

  it('never counts archived projects (D13)', () => {
    const base = withMode('overdue');
    const before = badgeCount(base, TODAY);
    // p1 owns one of the overdue tasks.
    const archived = {
      ...base,
      projects: base.projects.map((p) => (p.id === 'p1' ? { ...p, archived: true } : p)),
    };
    expect(badgeCount(archived, TODAY)).toBe(before - 1);
  });

  it('ignores the Work/Home filter — the badge describes the whole workspace', () => {
    // No scope argument exists to pass; this pins the intent so a future
    // refactor cannot quietly make the badge follow the visible tab.
    const base = withMode('overdue');
    const homeOnly = base.tasks.filter((t) => {
      const proj = base.projects.find((p) => p.id === t.projectId);
      return proj?.category === 'home' && isOverdue(t, TODAY);
    });
    expect(badgeCount(base, TODAY)).toBeGreaterThan(homeOnly.length);
  });
});
