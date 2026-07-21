import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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

function writeWorkspace(marker: string): void {
  for (const doc of ['workspace.json', 'projects.json', 'tasks.json', 'files.json']) {
    writeFileSync(join(dir, doc), JSON.stringify({ marker, doc }), 'utf8');
  }
  mkdirSync(join(dir, 'blobs'), { recursive: true });
  writeFileSync(join(dir, 'blobs', 'b1.pdf'), `blob-${marker}`, 'utf8');
}

function writeSettings(settings: Record<string, unknown>): void {
  writeFileSync(join(dir, 'settings.json'), JSON.stringify(settings), 'utf8');
}

function service(day = '2026-07-08'): BackupService {
  return new BackupService(dir, () => day);
}

describe('BackupService', () => {
  it('backs up documents and blobs into an ISO-dated day folder', () => {
    writeWorkspace('v1');
    writeSettings({});
    const result = service().runBackup();
    expect(result.ok).toBe(true);
    expect(result.path).toBe(join(dir, 'backups', '2026-07-08'));

    const day = join(dir, 'backups', '2026-07-08');
    expect(readdirSync(day).sort()).toEqual([
      'blobs',
      'files.json',
      'projects.json',
      'settings.json',
      'tasks.json',
      'workspace.json',
    ]);
    expect(readFileSync(join(day, 'blobs', 'b1.pdf'), 'utf8')).toBe('blob-v1');
    // No leftover tmp staging folder.
    expect(readdirSync(join(dir, 'backups')).some((f) => f.endsWith('.tmp'))).toBe(false);
  });

  it('a later run the same day refreshes that day folder (quit backup)', () => {
    writeWorkspace('morning');
    service().runBackup();
    writeWorkspace('evening');
    service().runBackup();

    const day = join(dir, 'backups', '2026-07-08');
    expect(JSON.parse(readFileSync(join(day, 'tasks.json'), 'utf8'))).toMatchObject({
      marker: 'evening',
    });
    expect(readFileSync(join(day, 'blobs', 'b1.pdf'), 'utf8')).toBe('blob-evening');
    expect(readdirSync(join(dir, 'backups'))).toEqual(['2026-07-08']);
  });

  it('runIfNeededToday backs up once per calendar day', () => {
    writeWorkspace('v1');
    const svc = service();
    svc.runIfNeededToday();
    expect(svc.hasBackupForToday()).toBe(true);

    // Mutate, run again same day: no refresh (only quit/manual refresh).
    writeWorkspace('v2');
    svc.runIfNeededToday();
    const day = join(dir, 'backups', '2026-07-08');
    expect(JSON.parse(readFileSync(join(day, 'tasks.json'), 'utf8'))).toMatchObject({
      marker: 'v1',
    });

    // Next calendar day: a new folder appears.
    service('2026-07-09').runIfNeededToday();
    expect(existsSync(join(dir, 'backups', '2026-07-09'))).toBe(true);
  });

  it('respects a custom backup directory from settings', () => {
    writeWorkspace('v1');
    const custom = join(dir, 'my-sync', 'ariadne-backups');
    writeSettings({ backupDir: custom });
    const result = service().runBackup();
    expect(result.path).toBe(join(custom, '2026-07-08'));
    expect(existsSync(join(custom, '2026-07-08', 'projects.json'))).toBe(true);
  });

  it('prunes to the configured retention (and clamps it to 1..100)', () => {
    writeWorkspace('v1');
    writeSettings({ backupKeep: 3 });
    for (let d = 1; d <= 6; d++) {
      service(`2026-07-${String(d).padStart(2, '0')}`).runBackup();
    }
    const days = readdirSync(join(dir, 'backups')).sort();
    expect(days).toEqual(['2026-07-04', '2026-07-05', '2026-07-06']);

    expect(service().resolveConfig().keep).toBe(3);
    writeSettings({ backupKeep: 5000 });
    expect(service().resolveConfig().keep).toBe(100);
    writeSettings({ backupKeep: 0 });
    expect(service().resolveConfig().keep).toBe(1);
    writeSettings({});
    expect(service().resolveConfig().keep).toBe(10);
  });

  it('ignores non-day folders when pruning and restoring', () => {
    writeWorkspace('v1');
    writeSettings({ backupKeep: 1 });
    mkdirSync(join(dir, 'backups', 'keep-me-forever'), { recursive: true });
    service('2026-07-01').runBackup();
    service('2026-07-02').runBackup();
    const entries = readdirSync(join(dir, 'backups')).sort();
    expect(entries).toEqual(['2026-07-02', 'keep-me-forever']);
  });

  it('latestBackupOf returns the newest day containing the document', () => {
    writeWorkspace('old');
    service('2026-07-01').runBackup();
    writeWorkspace('new');
    service('2026-07-02').runBackup();

    const path = service().latestBackupOf('tasks.json');
    expect(path).toBe(join(dir, 'backups', '2026-07-02', 'tasks.json'));
    expect(JSON.parse(readFileSync(path!, 'utf8'))).toMatchObject({ marker: 'new' });
    expect(service().latestBackupOf('nonexistent.json')).toBeNull();
  });

  it('refuses to run before a workspace exists', () => {
    expect(service().runBackup()).toMatchObject({ ok: false, error: 'Nothing to back up yet' });
    expect(existsSync(join(dir, 'backups'))).toBe(false);
  });

  it('reports run and prune events to the debug-log sink', () => {
    const lines: string[] = [];
    const debug = (message: string): void => {
      lines.push(message);
    };
    writeWorkspace('v1');
    writeSettings({ backupKeep: 1 });
    new BackupService(dir, () => '2026-07-01', debug).runBackup();
    new BackupService(dir, () => '2026-07-02', debug).runBackup();
    expect(lines).toEqual([
      `backup starting → ${join(dir, 'backups', '2026-07-01')}`,
      `backup complete: ${join(dir, 'backups', '2026-07-01')}`,
      `backup starting → ${join(dir, 'backups', '2026-07-02')}`,
      'pruned 1 old backup folder(s)',
      `backup complete: ${join(dir, 'backups', '2026-07-02')}`,
    ]);

    lines.length = 0;
    new BackupService(join(dir, 'empty-nowhere'), () => '2026-07-02', debug).runBackup();
    expect(lines).toEqual(['backup skipped: nothing to back up yet']);
  });
});
