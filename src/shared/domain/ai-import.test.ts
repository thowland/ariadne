import { describe, expect, it } from 'vitest';

import type { Project, Workspace } from '../types';
import { emptyWorkspace } from '../types';

import {
  AI_IMPORT_PROJECT_ID,
  AI_IMPORT_PROJECT_NAME,
  importReviewedTask,
  matchProjectHint,
  parseExtraction,
} from './ai-import';
import type { MutationCtx } from './mutate';

const TODAY = '2026-07-08';

function ctx(): MutationCtx {
  let n = 0;
  return { today: TODAY, newId: () => `id-${String(++n)}` };
}

function project(id: string, name: string): Project {
  return {
    id,
    name,
    category: 'work',
    tags: [],
    color: '#4f5bd5',
    status: 'Active',
    notes: '',
    links: [],
    createdAt: TODAY,
  };
}

function wsWith(projects: Project[]): Workspace {
  return { ...emptyWorkspace(), projects };
}

describe('parseExtraction', () => {
  it('accepts a well-formed response', () => {
    const tasks = parseExtraction({
      tasks: [
        {
          title: 'Ship the report',
          notes: 'for Friday standup',
          dueDate: '2026-07-10',
          priority: 'High',
          projectHint: 'Q3 Platform Migration',
        },
      ],
    });
    expect(tasks).toEqual([
      {
        title: 'Ship the report',
        notes: 'for Friday standup',
        dueDate: '2026-07-10',
        priority: 'High',
        projectHint: 'Q3 Platform Migration',
      },
    ]);
  });

  it('defaults malformed fields instead of failing the batch', () => {
    const tasks = parseExtraction({
      tasks: [
        {
          title: '  Call the plumber  ',
          notes: 42,
          dueDate: 'next Tuesday',
          priority: 'Urgent',
          projectHint: 7,
        },
      ],
    });
    expect(tasks).toEqual([
      {
        title: 'Call the plumber',
        notes: '',
        dueDate: null,
        priority: 'Medium',
        projectHint: null,
      },
    ]);
  });

  it('drops entries without a usable title', () => {
    const tasks = parseExtraction({
      tasks: [
        { title: '   ', notes: '', dueDate: null, priority: 'Low', projectHint: null },
        { title: 'Real task', notes: '', dueDate: null, priority: 'Low', projectHint: null },
        'not an object',
      ],
    });
    expect(tasks?.map((t) => t.title)).toEqual(['Real task']);
  });

  it('rejects responses without a tasks array', () => {
    expect(parseExtraction(null)).toBeNull();
    expect(parseExtraction('tasks')).toBeNull();
    expect(parseExtraction({ tasks: 'nope' })).toBeNull();
    expect(parseExtraction({})).toBeNull();
  });
});

describe('matchProjectHint', () => {
  const projects = [
    project('p1', 'Q3 Platform Migration'),
    project('p2', 'Customer Onboarding Revamp'),
    project('p3', 'Migration Runbook'),
  ];

  it('matches exact names case-insensitively', () => {
    expect(matchProjectHint(projects, 'q3 platform migration')).toBe('p1');
  });

  it('matches a unique substring either way round', () => {
    expect(matchProjectHint(projects, 'Onboarding')).toBe('p2');
    expect(matchProjectHint(projects, 'The Customer Onboarding Revamp project')).toBe('p2');
  });

  it('returns null for ambiguous, unknown, or empty hints', () => {
    expect(matchProjectHint(projects, 'Migration')).toBeNull(); // p1 and p3 both match
    expect(matchProjectHint(projects, 'Household')).toBeNull();
    expect(matchProjectHint(projects, '  ')).toBeNull();
    expect(matchProjectHint(projects, null)).toBeNull();
  });
});

describe('importReviewedTask', () => {
  const item = {
    title: 'Ship the report',
    notes: 'context',
    dueDate: '2026-07-10',
    priority: 'High' as const,
    projectId: null,
  };

  it('creates the AI Imported placeholder on first unmapped import', () => {
    const result = importReviewedTask(wsWith([project('p1', 'Alpha')]), ctx(), item);
    expect(result.projectCreated).toBe(true);
    expect(result.changed).toEqual(['projects', 'tasks']);
    const placeholder = result.workspace.projects.find((p) => p.id === AI_IMPORT_PROJECT_ID);
    expect(placeholder?.name).toBe(AI_IMPORT_PROJECT_NAME);
    const task = result.workspace.tasks.find((t) => t.id === result.taskId);
    expect(task).toMatchObject({
      projectId: AI_IMPORT_PROJECT_ID,
      title: 'Ship the report',
      status: 'Todo',
      priority: 'High',
      dueDate: '2026-07-10',
      tags: ['imported'],
      createdAt: TODAY,
    });
  });

  it('reuses the placeholder on later imports', () => {
    const c = ctx();
    const first = importReviewedTask(wsWith([]), c, item);
    const second = importReviewedTask(first.workspace, c, { ...item, title: 'Another' });
    expect(second.projectCreated).toBe(false);
    expect(second.changed).toEqual(['tasks']);
    expect(second.workspace.projects.filter((p) => p.id === AI_IMPORT_PROJECT_ID)).toHaveLength(1);
    expect(second.workspace.tasks).toHaveLength(2);
  });

  it('files under the chosen project when it exists', () => {
    const result = importReviewedTask(wsWith([project('p1', 'Alpha')]), ctx(), {
      ...item,
      projectId: 'p1',
    });
    expect(result.projectCreated).toBe(false);
    expect(result.workspace.tasks[0]?.projectId).toBe('p1');
    expect(result.workspace.projects).toHaveLength(1);
  });

  it('falls back to the placeholder when the chosen project vanished', () => {
    const result = importReviewedTask(wsWith([]), ctx(), { ...item, projectId: 'ghost' });
    expect(result.projectCreated).toBe(true);
    expect(result.workspace.tasks[0]?.projectId).toBe(AI_IMPORT_PROJECT_ID);
  });

  it('never creates a task with an empty title', () => {
    const result = importReviewedTask(wsWith([]), ctx(), { ...item, title: '   ' });
    expect(result.workspace.tasks[0]?.title).toBe('Untitled task');
  });
});
