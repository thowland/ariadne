import { describe, expect, it } from 'vitest';

import { seedWorkspace } from '../domain/seed';
import type { CollectionName } from '../types';

import { screenWorkspaceSave } from './write-guard';

const ws = seedWorkspace('2026-07-08');

/** prevCount stub: every document currently holds `n` entries. */
const counts = (n: number | null) => (): number | null => n;

function names(result: { accepted: [CollectionName, unknown][] }): CollectionName[] {
  return result.accepted.map(([name]) => name);
}

describe('screenWorkspaceSave', () => {
  it('accepts a valid full payload verbatim', () => {
    const r = screenWorkspaceSave(
      { projects: ws.projects, tasks: ws.tasks, files: ws.files, settings: ws.settings },
      counts(5),
    );
    expect(r.rejected).toEqual([]);
    expect(names(r)).toEqual(['projects', 'tasks', 'files', 'settings']);
    // Verbatim: the original array instance is what gets written.
    expect(r.accepted[0]?.[1]).toBe(ws.projects);
  });

  it('rejects payloads that fail the collection schema', () => {
    const r = screenWorkspaceSave(
      { projects: null, tasks: 'nope', settings: [], files: ws.files },
      counts(5),
    );
    expect(names(r)).toEqual(['files']);
    expect(r.rejected.map((x) => x.name)).toEqual(['projects', 'tasks', 'settings']);
  });

  it('blocks emptying a populated collection without replaceAll', () => {
    const r = screenWorkspaceSave({ projects: [] }, counts(6));
    expect(r.accepted).toEqual([]);
    expect(r.rejected[0]).toMatchObject({ name: 'projects' });
    expect(r.rejected[0]?.reason).toContain('refusing to overwrite 6 projects');
  });

  it('replaceAll bypasses the tripwire (clearAll / import flows)', () => {
    const r = screenWorkspaceSave(
      { projects: [], tasks: [], files: [], replaceAll: true },
      counts(6),
    );
    expect(r.rejected).toEqual([]);
    expect(names(r)).toEqual(['projects', 'tasks', 'files']);
  });

  it('allows emptying when the previous document held ≤ 1 entry or is unknown', () => {
    expect(screenWorkspaceSave({ projects: [] }, counts(1)).rejected).toEqual([]);
    expect(screenWorkspaceSave({ projects: [] }, counts(0)).rejected).toEqual([]);
    expect(screenWorkspaceSave({ projects: [] }, counts(null)).rejected).toEqual([]);
  });

  it('allows a delete cascade: tasks/files empty alongside a projects write', () => {
    const r = screenWorkspaceSave(
      { projects: ws.projects.slice(0, 1), tasks: [], files: [] },
      counts(9),
    );
    expect(r.rejected).toEqual([]);
    expect(names(r)).toEqual(['projects', 'tasks', 'files']);
  });

  it('still blocks an isolated tasks wipe (no projects in the payload)', () => {
    const r = screenWorkspaceSave({ tasks: [] }, counts(30));
    expect(r.rejected[0]).toMatchObject({ name: 'tasks' });
  });

  it('never blocks settings (object, not a list)', () => {
    const r = screenWorkspaceSave({ settings: ws.settings }, counts(99));
    expect(r.rejected).toEqual([]);
  });
});
