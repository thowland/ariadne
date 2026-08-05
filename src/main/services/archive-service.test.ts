import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { seedWorkspace } from '@shared/domain/seed';
import type { ExportDocument } from '@shared/schema/import-export';
import type { FileEntry } from '@shared/types';
import AdmZip from 'adm-zip';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ArchiveService, blobIdFromEntry } from './archive-service';
import type { ArchiveManifest } from './archive-service';
import { BackupService } from './backup-service';
import { BlobService } from './blob-service';
import { StorageService } from './storage-service';

const TODAY = '2026-07-08';

function binaryFile(patch: Partial<FileEntry> = {}): FileEntry {
  return {
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
    ...patch,
  };
}

let dir: string;
let storage: StorageService;
let blobs: BlobService;
let svc: ArchiveService;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ariadne-archive-'));
  blobs = new BlobService(dir);
  storage = new StorageService(dir, new BackupService(dir), 5);
  svc = new ArchiveService(storage, blobs, '1.14.0');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('blobIdFromEntry', () => {
  it('accepts flat blobs/<id>.<ext> names', () => {
    expect(blobIdFromEntry('blobs/abc-123.csv')).toBe('abc-123');
    expect(blobIdFromEntry('blobs/abc-123')).toBe('abc-123');
  });

  it('refuses anything outside a flat blobs/ entry', () => {
    expect(blobIdFromEntry('workspace.json')).toBeNull();
    expect(blobIdFromEntry('blobs/')).toBeNull();
    expect(blobIdFromEntry('blobs/nested/x.csv')).toBeNull();
    expect(blobIdFromEntry('blobs/..\\evil.csv')).toBeNull();
    // A traversal attempt that survives the slash checks still fails the id shape.
    expect(blobIdFromEntry('blobs/..')).toBeNull();
  });
});

describe('ArchiveService.exportTo', () => {
  it('writes workspace.json, a manifest, and one entry per stored blob', async () => {
    const ws = seedWorkspace(TODAY);
    ws.files.push(binaryFile());
    await storage.saveWorkspaceNow(ws);
    await blobs.save('bin1', 'csv', new TextEncoder().encode('a,b\n'));

    const target = join(dir, 'out.zip');
    const result = await svc.exportTo(target, () => new Date('2026-07-08T09:00:00Z'));
    expect(result).toMatchObject({ ok: true });
    expect(existsSync(target)).toBe(true);

    const zip = new AdmZip(target);
    const names = zip.getEntries().map((e) => e.entryName);
    expect(names).toContain('workspace.json');
    expect(names).toContain('manifest.json');
    expect(names).toContain('blobs/bin1.csv');

    const manifest = JSON.parse(zip.readAsText('manifest.json')) as ArchiveManifest;
    expect(manifest).toMatchObject({
      format: 'ariadne-archive',
      formatVersion: 1,
      appVersion: '1.14.0',
      exportedAt: '2026-07-08T09:00:00.000Z',
    });
    expect(manifest.counts.blobs).toBe(1);

    // Bytes travel as bytes, not base64 data URLs like the JSON export.
    expect(zip.readAsText('blobs/bin1.csv')).toBe('a,b\n');
    const doc = JSON.parse(zip.readAsText('workspace.json')) as ExportDocument;
    expect(doc.projects).toHaveLength(6);
    expect(doc._blobs).toEqual({});
  });

  it('skips file records whose bytes are missing from disk', async () => {
    const ws = seedWorkspace(TODAY);
    ws.files.push(binaryFile({ id: 'ghost' }));
    await storage.saveWorkspaceNow(ws);

    const result = await svc.exportTo(join(dir, 'out.zip'));
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.counts.blobs).toBe(0);
  });

  it('errors when there is nothing to export', async () => {
    expect(await svc.exportTo(join(dir, 'out.zip'))).toMatchObject({ ok: false });
  });

  it('reports a write failure instead of throwing', async () => {
    await storage.saveWorkspaceNow(seedWorkspace(TODAY));
    // A path whose parent is a file, not a directory.
    const blocker = join(dir, 'blocker');
    writeFileSync(blocker, 'x');
    const result = await svc.exportTo(join(blocker, 'out.zip'));
    expect(result.ok).toBe(false);
  });
});

describe('ArchiveService.importFrom', () => {
  it('round-trips a workspace and its file bytes', async () => {
    const ws = seedWorkspace(TODAY);
    ws.files.push(binaryFile());
    await storage.saveWorkspaceNow(ws);
    await blobs.save('bin1', 'csv', new TextEncoder().encode('a,b\n'));
    const target = join(dir, 'out.zip');
    await svc.exportTo(target);

    // Wipe the live workspace, then restore from the archive.
    await storage.saveWorkspaceNow({ projects: [], tasks: [], files: [], settings: ws.settings });
    await blobs.deleteMany(['bin1']);

    const result = await svc.importFrom(target);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workspace.projects).toHaveLength(6);
    expect(result.blobs).toBe(1);
    const restored = blobs.find('bin1');
    expect(restored).not.toBeNull();
    expect(readFileSync(restored!, 'utf8')).toBe('a,b\n');
  });

  it('ignores blob entries with no matching file record', async () => {
    const ws = seedWorkspace(TODAY);
    await storage.saveWorkspaceNow(ws);
    const target = join(dir, 'out.zip');
    await svc.exportTo(target);

    const zip = new AdmZip(target);
    zip.addFile('blobs/stranger.csv', Buffer.from('x'));
    zip.addFile('blobs/nested/evil.csv', Buffer.from('x'));
    zip.writeZip(target);

    const result = await svc.importFrom(target);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.blobs).toBe(0);
    expect(blobs.find('stranger')).toBeNull();
  });

  it('restores inline _blobs data URLs from a legacy-style document', async () => {
    const ws = seedWorkspace(TODAY);
    ws.files.push(binaryFile());
    const zip = new AdmZip();
    zip.addFile(
      'workspace.json',
      Buffer.from(
        JSON.stringify({
          schemaVersion: 1,
          ...ws,
          _blobs: { bin1: `data:text/csv;base64,${Buffer.from('z,z\n').toString('base64')}` },
        }),
      ),
    );
    const target = join(dir, 'legacy.zip');
    zip.writeZip(target);

    const result = await svc.importFrom(target);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.blobs).toBe(1);
    expect(readFileSync(blobs.find('bin1')!, 'utf8')).toBe('z,z\n');
  });

  it('rejects a file that is not a zip', async () => {
    const bad = join(dir, 'not.zip');
    writeFileSync(bad, 'definitely not a zip');
    expect(await svc.importFrom(bad)).toMatchObject({ ok: false });
  });

  it('rejects a zip without workspace.json', async () => {
    const zip = new AdmZip();
    zip.addFile('readme.txt', Buffer.from('hi'));
    const target = join(dir, 'wrong.zip');
    zip.writeZip(target);
    expect(await svc.importFrom(target)).toMatchObject({
      ok: false,
      error: 'Not an Ariadne archive (no workspace.json)',
    });
  });

  it('rejects a zip whose workspace.json is not an Ariadne export', async () => {
    const zip = new AdmZip();
    zip.addFile('workspace.json', Buffer.from('{"nope":true}'));
    const target = join(dir, 'junk.zip');
    zip.writeZip(target);
    expect(await svc.importFrom(target)).toMatchObject({ ok: false });
  });
});
