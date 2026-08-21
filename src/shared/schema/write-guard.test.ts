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
      {
        projects: ws.projects,
        tasks: ws.tasks,
        files: ws.files,
        contacts: ws.contacts,
        settings: ws.settings,
      },
      counts(5),
    );
    expect(r.rejected).toEqual([]);
    expect(names(r)).toEqual(['projects', 'tasks', 'files', 'contacts', 'settings']);
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

describe('contacts (D31) go through the same screen', () => {
  it('accepts a valid contacts payload', () => {
    const r = screenWorkspaceSave({ contacts: ws.contacts }, counts(5));
    expect(names(r)).toEqual(['contacts']);
  });

  it('rejects a malformed contacts payload rather than writing it', () => {
    const r = screenWorkspaceSave({ contacts: [{ firstName: 'no id' }] }, counts(5));
    expect(r.accepted).toEqual([]);
    expect(r.rejected.map((x) => x.name)).toEqual(['contacts']);
  });

  it('refuses to empty a populated address book by accident, but allows the wipe', () => {
    expect(screenWorkspaceSave({ contacts: [] }, counts(7)).rejected.map((x) => x.name)).toEqual([
      'contacts',
    ]);
    expect(names(screenWorkspaceSave({ contacts: [], replaceAll: true }, counts(7)))).toEqual([
      'contacts',
    ]);
    // Deleting the last contact is not a shrink worth blocking.
    expect(names(screenWorkspaceSave({ contacts: [] }, counts(1)))).toEqual(['contacts']);
  });
});
