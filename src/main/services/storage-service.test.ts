import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { seedWorkspace } from '@shared/domain/seed';
import { DEFAULT_SETTINGS } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BackupService } from './backup-service';
import { StorageService } from './storage-service';

const TODAY = '2026-07-08';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ariadne-storage-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function makeService(debounceMs = 5): StorageService {
  return new StorageService(dir, new BackupService(dir), debounceMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('StorageService', () => {
  it('init creates the directory skeleton and meta document', () => {
    makeService().init();
    expect(existsSync(join(dir, 'blobs'))).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, 'workspace.json'), 'utf8'))).toEqual({
      schemaVersion: 1,
    });
  });

  it('reports no workspace on a fresh directory', async () => {
    const svc = makeService();
    svc.init();
    expect(svc.hasWorkspace()).toBe(false);
    expect((await svc.loadWorkspace()).workspace).toBeNull();
  });

  it('round-trips a full workspace (saveWorkspaceNow → loadWorkspace)', async () => {
    const svc = makeService();
    const seeded = seedWorkspace(TODAY);
    await svc.saveWorkspaceNow(seeded);

    const { workspace, warnings } = await svc.loadWorkspace();
    expect(warnings).toEqual([]);
    expect(workspace).toEqual(seeded);
  });

  it('writes atomically — no .tmp files left behind', async () => {
    const svc = makeService();
    await svc.saveWorkspaceNow(seedWorkspace(TODAY));
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('debounces scheduled saves and coalesces to the last value', async () => {
    const svc = makeService(20);
    svc.init();
    const seeded = seedWorkspace(TODAY);
    await svc.saveWorkspaceNow(seeded);

    svc.scheduleSave('settings', { todoistToken: 'first', lastTodoistSyncAt: null });
    svc.scheduleSave('settings', { todoistToken: 'second', lastTodoistSyncAt: null });
    expect(svc.pendingCount()).toBe(1);
    await sleep(60);

    expect(svc.pendingCount()).toBe(0);
    const onDisk = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8')) as {
      todoistToken: string;
    };
    expect(onDisk.todoistToken).toBe('second');
  });

  it('flushAll writes pending saves immediately (quit path)', async () => {
    const svc = makeService(10_000); // debounce far in the future
    svc.init();
    await svc.saveWorkspaceNow(seedWorkspace(TODAY));

    svc.scheduleSave('settings', { todoistToken: 'flushed', lastTodoistSyncAt: null });
    await svc.flushAll();

    const onDisk = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8')) as {
      todoistToken: string;
    };
    expect(onDisk.todoistToken).toBe('flushed');
    expect(svc.pendingCount()).toBe(0);
  });

  it('savePayload rejects malformed collections and leaves the documents untouched', async () => {
    const svc = makeService(5);
    const seeded = seedWorkspace(TODAY);
    await svc.saveWorkspaceNow(seeded);

    const rejected = svc.savePayload({ projects: null, tasks: 'garbage' });
    expect(rejected.map((r) => r.name)).toEqual(['projects', 'tasks']);
    expect(svc.pendingCount()).toBe(0);
    await sleep(30);
    expect(JSON.parse(readFileSync(join(dir, 'projects.json'), 'utf8'))).toEqual(seeded.projects);
  });

  it('savePayload refuses to wipe a populated collection without replaceAll', async () => {
    const svc = makeService(5);
    const seeded = seedWorkspace(TODAY);
    await svc.saveWorkspaceNow(seeded);

    const rejected = svc.savePayload({ tasks: [] });
    expect(rejected[0]).toMatchObject({ name: 'tasks' });
    await sleep(30);
    expect(JSON.parse(readFileSync(join(dir, 'tasks.json'), 'utf8'))).toEqual(seeded.tasks);

    // The deliberate wipe flows (clearAll / import) carry replaceAll.
    const ok = svc.savePayload({ projects: [], tasks: [], files: [], replaceAll: true });
    expect(ok).toEqual([]);
    await sleep(30);
    expect(JSON.parse(readFileSync(join(dir, 'tasks.json'), 'utf8'))).toEqual([]);
    expect(JSON.parse(readFileSync(join(dir, 'projects.json'), 'utf8'))).toEqual([]);
  });

  it('savePayload consults pending (unflushed) state, not just disk', async () => {
    const svc = makeService(10_000);
    const seeded = seedWorkspace(TODAY);
    await svc.saveWorkspaceNow(seeded);

    // Renderer deletes down to one project (pending, not yet flushed), then
    // deletes the last one: disk still shows many, pending shows 1 → allowed.
    const one = seeded.projects.slice(0, 1);
    expect(svc.savePayload({ projects: one })).toEqual([]);
    expect(svc.savePayload({ projects: [] })).toEqual([]);
    await svc.flushAll();
    expect(JSON.parse(readFileSync(join(dir, 'projects.json'), 'utf8'))).toEqual([]);
  });

  it('savePayload allows a project-delete cascade to empty dependents', async () => {
    const svc = makeService(5);
    const seeded = seedWorkspace(TODAY);
    await svc.saveWorkspaceNow(seeded);

    const rejected = svc.savePayload({
      projects: seeded.projects.slice(0, 1),
      tasks: [],
      files: [],
    });
    expect(rejected).toEqual([]);
    await sleep(30);
    expect(JSON.parse(readFileSync(join(dir, 'tasks.json'), 'utf8'))).toEqual([]);
  });

  it('quarantines a corrupt document and restores from backup', async () => {
    const svc = makeService();
    const seeded = seedWorkspace(TODAY);
    await svc.saveWorkspaceNow(seeded);

    // Take a backup of the good state, then corrupt tasks.json.
    new BackupService(dir, () => TODAY).runBackup();
    writeFileSync(join(dir, 'tasks.json'), '{definitely not json', 'utf8');

    const { workspace, warnings } = await svc.loadWorkspace();
    expect(warnings.some((w) => w.includes('tasks.json'))).toBe(true);
    expect(warnings.some((w) => w.includes('restored from backup'))).toBe(true);
    expect(workspace?.tasks).toEqual(seeded.tasks);
    // Quarantine copy exists.
    expect(readdirSync(dir).some((f) => f.startsWith('tasks.json.corrupt-'))).toBe(true);
  });

  it('starts a corrupt document empty when no backup exists', async () => {
    const svc = makeService();
    const seeded = seedWorkspace(TODAY);
    await svc.saveWorkspaceNow(seeded);
    writeFileSync(join(dir, 'tasks.json'), '[{"bogus": true}]', 'utf8');

    const { workspace, warnings } = await svc.loadWorkspace();
    expect(workspace?.tasks).toEqual([]);
    expect(workspace?.projects).toEqual(seeded.projects);
    expect(warnings.some((w) => w.includes('could not be recovered'))).toBe(true);
  });

  it('defaults missing settings without warnings', async () => {
    const svc = makeService();
    const seeded = seedWorkspace(TODAY);
    await svc.saveWorkspaceNow(seeded);
    rmSync(join(dir, 'settings.json'));

    const { workspace, warnings } = await svc.loadWorkspace();
    expect(workspace?.settings).toEqual(DEFAULT_SETTINGS);
    expect(warnings).toEqual([]);
  });

  it('warns when the workspace schema is newer than the app', async () => {
    const svc = makeService();
    await svc.saveWorkspaceNow(seedWorkspace(TODAY));
    writeFileSync(join(dir, 'workspace.json'), JSON.stringify({ schemaVersion: 99 }), 'utf8');

    const { warnings } = await svc.loadWorkspace();
    expect(warnings.some((w) => w.includes('newer than this app'))).toBe(true);
  });

  it('normalizes referential integrity on load', async () => {
    const svc = makeService();
    const seeded = seedWorkspace(TODAY);
    await svc.saveWorkspaceNow(seeded);
    // Inject an orphan task directly on disk.
    const tasks = JSON.parse(readFileSync(join(dir, 'tasks.json'), 'utf8')) as unknown[];
    tasks.push({ ...(tasks[0] as object), id: 'orphan', projectId: 'ghost' });
    writeFileSync(join(dir, 'tasks.json'), JSON.stringify(tasks), 'utf8');

    const { workspace, warnings } = await svc.loadWorkspace();
    expect(workspace?.tasks.some((t) => t.id === 'orphan')).toBe(false);
    expect(warnings.some((w) => w.includes('no parent project'))).toBe(true);
  });
});
