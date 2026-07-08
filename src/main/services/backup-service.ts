import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';

import { todayIso } from '@shared/domain/clock';
import type { IsoDate } from '@shared/types';
import { BACKUP_KEEP_DEFAULT, BACKUP_KEEP_MAX } from '@shared/types';

const DOCUMENTS = ['workspace.json', 'projects.json', 'tasks.json', 'files.json', 'settings.json'];
const DAY_FOLDER_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface BackupResult {
  ok: boolean;
  path?: string;
  error?: string;
}

/**
 * Daily whole-workspace backups: the JSON documents plus the blobs directory
 * (uploaded files), copied into `<backupDir>/<YYYY-MM-DD>/`. One folder per
 * day — later runs the same day (including the on-quit backup) refresh it.
 * The folder location and retention (1–100 days, default 10) come from
 * settings.json so the Settings UI edits them like everything else.
 */
export class BackupService {
  constructor(
    private readonly dataDir: string,
    private readonly today: () => IsoDate = () => todayIso(process.env.ARIADNE_FAKE_TODAY),
  ) {}

  /** Effective config, read from settings.json best-effort. */
  resolveConfig(): { backupDir: string; keep: number } {
    let backupDir: string | null = null;
    let keep = BACKUP_KEEP_DEFAULT;
    try {
      const raw: unknown = JSON.parse(readFileSync(join(this.dataDir, 'settings.json'), 'utf8'));
      if (typeof raw === 'object' && raw !== null) {
        const settings = raw as Record<string, unknown>;
        if (typeof settings.backupDir === 'string' && settings.backupDir.trim() !== '') {
          backupDir = settings.backupDir;
        }
        if (typeof settings.backupKeep === 'number' && Number.isFinite(settings.backupKeep)) {
          keep = Math.min(BACKUP_KEEP_MAX, Math.max(1, Math.round(settings.backupKeep)));
        }
      }
    } catch {
      // Missing/corrupt settings — fall back to defaults.
    }
    return { backupDir: backupDir ?? join(this.dataDir, 'backups'), keep };
  }

  hasBackupForToday(): boolean {
    return existsSync(join(this.resolveConfig().backupDir, this.today()));
  }

  /** Run at startup and hourly: back up once per calendar day. */
  runIfNeededToday(): void {
    if (!this.hasBackupForToday()) this.runBackup();
  }

  /**
   * Copy the workspace into today's folder (built as .tmp then swapped, so a
   * crash mid-copy never leaves a half backup as the day's folder).
   */
  runBackup(): BackupResult {
    if (!existsSync(join(this.dataDir, 'projects.json'))) {
      return { ok: false, error: 'Nothing to back up yet' };
    }
    const { backupDir, keep } = this.resolveConfig();
    const target = join(backupDir, this.today());
    const tmp = `${target}.tmp`;
    try {
      rmSync(tmp, { recursive: true, force: true });
      mkdirSync(tmp, { recursive: true });
      for (const doc of DOCUMENTS) {
        const source = join(this.dataDir, doc);
        if (existsSync(source)) copyFileSync(source, join(tmp, doc));
      }
      const blobsDir = join(this.dataDir, 'blobs');
      if (existsSync(blobsDir)) cpSync(blobsDir, join(tmp, 'blobs'), { recursive: true });

      rmSync(target, { recursive: true, force: true });
      renameSync(tmp, target);
      this.prune(backupDir, keep);
      return { ok: true, path: target };
    } catch (err) {
      rmSync(tmp, { recursive: true, force: true });
      return { ok: false, error: err instanceof Error ? err.message : 'Backup failed' };
    }
  }

  /** Keep only the newest `keep` day folders; ignore anything else in the dir. */
  private prune(backupDir: string, keep: number): void {
    const days = readdirSync(backupDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && DAY_FOLDER_RE.test(e.name))
      .map((e) => e.name)
      .sort(); // ISO dates sort chronologically
    while (days.length > keep) {
      const oldest = days.shift();
      if (oldest === undefined) break;
      rmSync(join(backupDir, oldest), { recursive: true, force: true });
    }
  }

  /** Newest backup containing `document` (corrupt-file recovery), or null. */
  latestBackupOf(document: string): string | null {
    const { backupDir } = this.resolveConfig();
    if (!existsSync(backupDir)) return null;
    const days = readdirSync(backupDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && DAY_FOLDER_RE.test(e.name))
      .map((e) => e.name)
      .sort()
      .reverse();
    for (const day of days) {
      const candidate = join(backupDir, day, document);
      if (existsSync(candidate)) return candidate;
    }
    return null;
  }
}
