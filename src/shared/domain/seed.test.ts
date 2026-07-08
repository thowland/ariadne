import { describe, expect, it } from 'vitest';

import { normalizeWorkspace } from '../schema/workspace-schema';

import { isBlocked, indexTasks, isOverdue } from './derive';
import { seedWorkspace } from './seed';

const TODAY = '2026-07-08';

describe('seedWorkspace', () => {
  const ws = seedWorkspace(TODAY);

  it('matches the prototype dataset shape', () => {
    expect(ws.projects).toHaveLength(6);
    expect(ws.tasks).toHaveLength(30);
    expect(ws.files).toHaveLength(5);
    expect(ws.settings.todoistToken).toBe('');
  });

  it('is referentially intact (normalization changes nothing)', () => {
    const { workspace, warnings } = normalizeWorkspace(
      structuredClone(ws.projects),
      structuredClone(ws.tasks),
      structuredClone(ws.files),
      { ...ws.settings },
    );
    expect(warnings).toEqual([]);
    expect(workspace.tasks).toEqual(ws.tasks);
    expect(workspace.files).toEqual(ws.files);
  });

  it('is deterministic for a given today', () => {
    expect(seedWorkspace(TODAY)).toEqual(ws);
  });

  it('shifts dates relative to today', () => {
    const shifted = seedWorkspace('2027-01-01');
    const cutover = shifted.tasks.find((t) => t.title === 'Cutover & DNS switch');
    expect(cutover?.dueDate).toBe('2027-01-17'); // today + 16
  });

  it('reproduces the prototype demo state (overdue + blocked examples)', () => {
    const byId = indexTasks(ws.tasks);
    const auth = ws.tasks.find((t) => t.title === 'Migrate auth service');
    expect(auth).toBeDefined();
    expect(isOverdue(auth!, TODAY)).toBe(true); // due today-1
    expect(isBlocked(auth!, byId)).toBe(true); // provision cluster still Doing

    const overdueCount = ws.tasks.filter((t) => isOverdue(t, TODAY)).length;
    expect(overdueCount).toBe(3); // auth service, sanding, 1099s
  });

  it('honors the Done ⇔ completedAt invariant everywhere', () => {
    for (const t of ws.tasks) {
      expect(t.completedAt !== null).toBe(t.status === 'Done');
    }
  });
});
