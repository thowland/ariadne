import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { seedWorkspace } from '@shared/domain/seed';
import type { ExportDocument } from '@shared/schema/import-export';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BackupService } from './backup-service';
import { BlobService } from './blob-service';
import { ImportExportService } from './import-export-service';
import { StorageService } from './storage-service';

const TODAY = '2026-07-08';

let dir: string;
let storage: StorageService;
let blobs: BlobService;
let svc: ImportExportService;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ariadne-ie-'));
  blobs = new BlobService(dir);
  storage = new StorageService(dir, new BackupService(dir), 5);
  svc = new ImportExportService(storage, blobs);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('ImportExportService', () => {
  it('exports the workspace with blob bytes as data URLs', async () => {
    const ws = seedWorkspace(TODAY);
    ws.files.push({
      id: 'bin1',
      projectId: 'p1',
      taskId: null,
      name: 'notes.csv',
      ext: 'csv',
      mime: 'text/csv',
      kind: 'file',
      size: 4,
      content: '',
      createdAt: TODAY,
    });
    await storage.saveWorkspaceNow(ws);
    await blobs.save('bin1', 'csv', new TextEncoder().encode('a,b\n'));

    const target = join(dir, 'export.json');
    const result = await svc.exportTo(target);
    expect(result.ok).toBe(true);

    const doc = JSON.parse(readFileSync(target, 'utf8')) as ExportDocument;
    expect(doc.schemaVersion).toBe(1);
    expect(doc.projects).toHaveLength(6);
    expect(doc._blobs.bin1).toBe(`data:text/csv;base64,${btoa('a,b\n')}`);
  });

  it('errors when there is nothing to export', async () => {
    const result = await svc.exportTo(join(dir, 'export.json'));
    expect(result).toMatchObject({ ok: false });
  });

  it('import round trip restores workspace and blob bytes', async () => {
    const ws = seedWorkspace(TODAY);
    ws.files.push({
      id: 'bin1',
      projectId: 'p1',
      taskId: null,
      name: 'notes.csv',
      ext: 'csv',
      mime: 'text/csv',
      kind: 'file',
      size: 4,
      content: '',
      createdAt: TODAY,
    });
    await storage.saveWorkspaceNow(ws);
    await blobs.save('bin1', 'csv', new TextEncoder().encode('a,b\n'));
    const target = join(dir, 'export.json');
    await svc.exportTo(target);

    // Import into a completely fresh data directory.
    const dir2 = mkdtempSync(join(tmpdir(), 'ariadne-ie2-'));
    try {
      const storage2 = new StorageService(dir2, new BackupService(dir2), 5);
      const blobs2 = new BlobService(dir2);
      const svc2 = new ImportExportService(storage2, blobs2);

      const outcome = await svc2.importFromFile(target);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.workspace.tasks).toEqual(ws.tasks);

      const loaded = await storage2.loadWorkspace();
      expect(loaded.workspace?.files.some((f) => f.id === 'bin1')).toBe(true);
      const blobPath = blobs2.find('bin1');
      expect(blobPath).not.toBeNull();
      expect(readFileSync(blobPath!, 'utf8')).toBe('a,b\n');
    } finally {
      rmSync(dir2, { recursive: true, force: true });
    }
  });

  it('propagates parse errors and unreadable files', async () => {
    const bad = await svc.importFromText('{nope');
    expect(bad).toMatchObject({ ok: false, error: 'Invalid JSON — import failed' });

    const missing = await svc.importFromFile(join(dir, 'does-not-exist.json'));
    expect(missing).toMatchObject({ ok: false, error: 'Could not read the selected file' });
  });
});
