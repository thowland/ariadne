import { describe, expect, it } from 'vitest';

import { searchProjects, searchTasks } from './search';
import { seedWorkspace } from './seed';

const ws = seedWorkspace('2026-07-08');

describe('searchProjects', () => {
  it('matches names case-insensitively', () => {
    expect(searchProjects(ws.projects, 'migration').map((p) => p.id)).toEqual(['p1']);
    expect(searchProjects(ws.projects, 'BOAT').map((p) => p.id)).toEqual(['p3']);
  });

  it('matches tags', () => {
    expect(searchProjects(ws.projects, 'woodwork').map((p) => p.id)).toEqual(['p3']);
  });

  it('returns nothing for empty or whitespace queries', () => {
    expect(searchProjects(ws.projects, '')).toEqual([]);
    expect(searchProjects(ws.projects, '   ')).toEqual([]);
  });
});

describe('searchTasks', () => {
  it('matches titles case-insensitively', () => {
    const hits = searchTasks(ws.tasks, 'varnish');
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits.every((t) => t.projectId === 'p3')).toBe(true);
  });

  it('matches notes and tags', () => {
    const withNotes = [{ ...ws.tasks[0], notes: 'special-marker' }] as typeof ws.tasks;
    expect(searchTasks(withNotes, 'SPECIAL-mark')).toHaveLength(1);
    const withTags = [{ ...ws.tasks[0], tags: ['todoist'] }] as typeof ws.tasks;
    expect(searchTasks(withTags, 'todoist')).toHaveLength(1);
  });

  it('returns nothing for empty queries or no matches', () => {
    expect(searchTasks(ws.tasks, '')).toEqual([]);
    expect(searchTasks(ws.tasks, 'zzz-no-such-task')).toEqual([]);
  });
});
