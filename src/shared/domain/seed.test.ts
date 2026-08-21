import { describe, expect, it } from 'vitest';

import { normalizeWorkspace } from '../schema/workspace-schema';

import { isBlocked, indexTasks, isOverdue } from './derive';
import { DEFER_THRESHOLD_DEFAULT, deferredReport } from './reports';
import { seedWorkspace } from './seed';

const TODAY = '2026-07-08';

describe('seedWorkspace', () => {
  const ws = seedWorkspace(TODAY);

  it('reaches the interesting branches of every contacts surface (D31)', () => {
    // A stakeholder attached to a project but to none of its tasks, two
    // people at one outside company, and colleagues with no company at all:
    // the union card, the company breakdown, and the "no company" path are
    // all exercised by the demo state rather than only by hand-built fixtures.
    expect(ws.projects.some((p) => (p.contactIds ?? []).length > 0)).toBe(true);
    expect(ws.tasks.filter((t) => (t.contactIds ?? []).length > 0).length).toBeGreaterThan(5);
    const c7 = ws.contacts.find((c) => c.id === 'c7');
    expect(c7).toBeDefined();
    expect(ws.tasks.some((t) => (t.contactIds ?? []).includes('c7'))).toBe(false);
    expect(ws.contacts.filter((c) => c.company === 'Northwind Systems')).toHaveLength(2);
    expect(ws.contacts.some((c) => c.company === '')).toBe(true);
    expect(ws.contacts.every((c) => c.email !== '' && c.phone !== '')).toBe(true);
  });

  it('matches the prototype dataset shape', () => {
    expect(ws.projects).toHaveLength(6);
    expect(ws.tasks).toHaveLength(30);
    expect(ws.files).toHaveLength(5);
    expect(ws.contacts).toHaveLength(7);
    expect(ws.settings.todoistToken).toBe('');
  });

  it('is referentially intact (normalization changes nothing)', () => {
    const { workspace, warnings } = normalizeWorkspace(
      structuredClone(ws.projects),
      structuredClone(ws.tasks),
      structuredClone(ws.files),
      structuredClone(ws.contacts),
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

  /**
   * The deferred report (D23) rendered its empty state for every seeded
   * workspace until 1.19.2, so nothing — screenshots, E2E, or a human looking
   * at the demo — ever exercised it. These assertions keep the demo state
   * covering the branches the report actually has.
   */
  describe('deferral history (D23)', () => {
    const deferred = ws.tasks.filter((t) => (t.deferrals?.length ?? 0) > 0);
    const result = deferredReport(ws, 'all', DEFER_THRESHOLD_DEFAULT, TODAY);

    it('seeds tasks on both sides of the default threshold', () => {
      expect(deferred.length).toBeGreaterThan(0);
      expect(result.analytics.tasksEverDeferred).toBe(deferred.length);
      // Rows above the threshold, plus at least one below it so the report's
      // "lower the threshold" hint describes something real.
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.analytics.tasksEverDeferred).toBeGreaterThan(result.rows.length);
    });

    it('covers the chronic-overdue and completed-anyway outcomes', () => {
      expect(result.analytics.chronicOverdue).toBeGreaterThan(0);
      expect(result.analytics.completedAnyway).toBeGreaterThan(0);
    });

    it('spreads churn across several projects and priorities', () => {
      expect(result.analytics.byProject.length).toBeGreaterThanOrEqual(3);
      expect(result.analytics.byPriority.length).toBeGreaterThanOrEqual(3);
    });

    it('records only genuine push-outs, in chronological order', () => {
      for (const task of deferred) {
        const list = task.deferrals ?? [];
        for (const [i, dfr] of list.entries()) {
          // A deferral moves a due date later; the record is stamped no later
          // than the date it moved off.
          expect(dfr.to > dfr.from, `${task.title}: ${dfr.from} → ${dfr.to}`).toBe(true);
          expect(dfr.on <= dfr.from).toBe(true);
          // Each push-out starts where the previous one landed.
          const prev = list[i - 1];
          if (prev !== undefined) expect(dfr.from).toBe(prev.to);
        }
        // The chain ends at the task's current due date.
        const last = list[list.length - 1];
        if (last !== undefined && task.dueDate !== null) expect(task.dueDate).toBe(last.to);
      }
    });
  });
});
