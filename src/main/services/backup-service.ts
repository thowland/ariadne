import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const BACKUP_KEEP = 10;
const DOCUMENTS = ['projects.json', 'tasks.json', 'files.json', 'settings.json'];

/**
 * Rotating snapshots of the workspace JSON documents. One snapshot is taken
 * before the first write of each app session; the newest BACKUP_KEEP are kept.
 */
export class BackupService {
  private snapshotTaken = false;

  constructor(
    private readonly dataDir: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private get backupsDir(): string {
    return join(this.dataDir, 'backups');
  }

  /** Snapshot once per service instance (i.e. once per app session). */
  snapshotOnce(): void {
    if (this.snapshotTaken) return;
    this.snapshotTaken = true;

    const present = DOCUMENTS.filter((doc) => existsSync(join(this.dataDir, doc)));
    if (present.length === 0) return; // nothing to protect yet

    const stamp = this.now().toISOString().replace(/[:.]/g, '-');
    const dir = join(this.backupsDir, stamp);
    mkdirSync(dir, { recursive: true });
    for (const doc of present) {
      copyFileSync(join(this.dataDir, doc), join(dir, doc));
    }
    this.prune();
  }

  private prune(): void {
    const entries = readdirSync(this.backupsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort(); // ISO timestamps sort chronologically
    while (entries.length > BACKUP_KEEP) {
      const oldest = entries.shift();
      if (oldest === undefined) break;
      rmSync(join(this.backupsDir, oldest), { recursive: true, force: true });
    }
  }

  /** Newest backup containing `document`, or null. */
  latestBackupOf(document: string): string | null {
    if (!existsSync(this.backupsDir)) return null;
    const entries = readdirSync(this.backupsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
      .reverse();
    for (const name of entries) {
      const candidate = join(this.backupsDir, name, document);
      if (existsSync(candidate)) return candidate;
    }
    return null;
  }
}
