import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { isoAdd } from '@shared/domain/dates';
import { indexTasks, isBlocked } from '@shared/domain/derive';
import { weeklyStatus } from '@shared/domain/reports';
import type { Task, Workspace } from '@shared/types';
import { DEFAULT_SETTINGS, PROJECT_PALETTE } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BackupService } from './backup-service';
import { StorageService } from './storage-service';

const TODAY = '2026-07-08';

/** 5× the design scale (spec: 10–20 projects × 1–50 tasks): 100 × 50. */
function bigWorkspace(): Workspace {
  const projects = Array.from({ length: 100 }, (_, i) => ({
    id: `p${String(i)}`,
    name: `Project ${String(i)}`,
    category: i % 2 === 0 ? ('work' as const) : ('home' as const),
    tags: [`tag${String(i % 10)}`],
    color: PROJECT_PALETTE[i % PROJECT_PALETTE.length] as string,
    status: 'Active',
    notes: 'x'.repeat(200),
    links: [],
    createdAt: TODAY,
  }));
  const tasks: Task[] = [];
  for (let p = 0; p < 100; p++) {
    for (let t = 0; t < 50; t++) {
      const id = `t${String(p)}-${String(t)}`;
      tasks.push({
        id,
        projectId: `p${String(p)}`,
        title: `Task ${id} with a reasonably long title`,
        status: t % 7 === 0 ? 'Done' : 'Todo',
        priority: t % 5 === 0 ? 'High' : 'Medium',
        tags: [],
        notes: '',
        dueDate: t % 3 === 0 ? isoAdd(TODAY, (t % 30) - 10) : null,
        dependsOn: t > 0 && t % 4 === 0 ? [`t${String(p)}-${String(t - 1)}`] : [],
        subtasks: [],
        links: [],
        createdAt: TODAY,
        completedAt: t % 7 === 0 ? TODAY : null,
      });
    }
  }
  return { projects, tasks, files: [], contacts: [], settings: { ...DEFAULT_SETTINGS } };
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ariadne-perf-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('performance sanity at 5× design scale (100 projects / 5,000 tasks)', () => {
  it('persists and reloads within generous bounds', async () => {
    const ws = bigWorkspace();
    const storage = new StorageService(dir, new BackupService(dir), 5);

    const saveStart = performance.now();
    await storage.saveWorkspaceNow(ws);
    const saveMs = performance.now() - saveStart;

    const loadStart = performance.now();
    const { workspace } = await storage.loadWorkspace();
    const loadMs = performance.now() - loadStart;

    expect(workspace?.tasks).toHaveLength(5000);
    // Generous ceilings — this is a regression tripwire, not a benchmark.
    expect(saveMs).toBeLessThan(3000);
    expect(loadMs).toBeLessThan(3000);
  });

  it('derives and reports stay interactive', () => {
    const ws = bigWorkspace();
    const start = performance.now();
    const byId = indexTasks(ws.tasks);
    const blocked = ws.tasks.filter((t) => isBlocked(t, byId)).length;
    const blocks = weeklyStatus(ws, 'all', TODAY);
    const elapsed = performance.now() - start;

    expect(blocked).toBeGreaterThan(0);
    expect(blocks.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(1500);
  });
});
