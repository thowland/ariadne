import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BackupService } from './backup-service';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ariadne-backup-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeDocs(marker: string): void {
  for (const doc of ['projects.json', 'tasks.json', 'files.json', 'settings.json']) {
    writeFileSync(join(dir, doc), JSON.stringify({ marker, doc }), 'utf8');
  }
}

function clockAt(iso: string): () => Date {
  return () => new Date(iso);
}

describe('BackupService', () => {
  it('snapshots the documents once per instance', () => {
    writeDocs('v1');
    const svc = new BackupService(dir, clockAt('2026-07-08T09:00:00Z'));
    svc.snapshotOnce();
    svc.snapshotOnce(); // second call is a no-op

    const snapshots = readdirSync(join(dir, 'backups'));
    expect(snapshots).toHaveLength(1);
    const files = readdirSync(join(dir, 'backups', snapshots[0]!));
    expect(files.sort()).toEqual(['files.json', 'projects.json', 'settings.json', 'tasks.json']);
  });

  it('does nothing when there are no documents yet', () => {
    const svc = new BackupService(dir);
    svc.snapshotOnce();
    expect(readdirSync(dir)).toEqual([]);
  });

  it('keeps only the 10 newest snapshots', () => {
    writeDocs('v1');
    for (let i = 0; i < 13; i++) {
      const svc = new BackupService(
        dir,
        clockAt(`2026-07-${String(i + 1).padStart(2, '0')}T09:00:00Z`),
      );
      svc.snapshotOnce();
    }
    const snapshots = readdirSync(join(dir, 'backups')).sort();
    expect(snapshots).toHaveLength(10);
    // The three oldest (days 1-3) were pruned.
    expect(snapshots[0]!.startsWith('2026-07-04')).toBe(true);
  });

  it('latestBackupOf returns the newest copy containing the document', () => {
    writeDocs('old');
    new BackupService(dir, clockAt('2026-07-01T09:00:00Z')).snapshotOnce();
    writeDocs('new');
    new BackupService(dir, clockAt('2026-07-02T09:00:00Z')).snapshotOnce();

    const path = new BackupService(dir).latestBackupOf('tasks.json');
    expect(path).not.toBeNull();
    expect(JSON.parse(readFileSync(path!, 'utf8'))).toEqual({ marker: 'new', doc: 'tasks.json' });
  });

  it('latestBackupOf returns null with no backups', () => {
    expect(new BackupService(dir).latestBackupOf('tasks.json')).toBeNull();
  });
});
