import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { SaveStatusEvent } from '@shared/ipc-contract';
import {
  contactsFileSchema,
  filesFileSchema,
  normalizeWorkspace,
  projectsFileSchema,
  settingsSchema,
  tasksFileSchema,
  workspaceMetaSchema,
} from '@shared/schema/workspace-schema';
import type { RejectedWrite } from '@shared/schema/write-guard';
import { screenWorkspaceSave } from '@shared/schema/write-guard';
import type { CollectionName, Workspace } from '@shared/types';
import { DEFAULT_SETTINGS, SCHEMA_VERSION } from '@shared/types';
import type { ZodType, ZodTypeDef } from 'zod';

import type { BackupService } from './backup-service';

export interface LoadResult {
  /** Null when the directory holds no workspace yet (first run). */
  workspace: Workspace | null;
  warnings: string[];
}

interface PendingWrite {
  timer: NodeJS.Timeout;
  data: unknown;
}

/** How long after a failed write before the kept-pending data is retried. */
const WRITE_RETRY_MS = 15_000;

/**
 * Owns the workspace JSON documents in the data directory. Writes are
 * debounced per collection and always atomic (write .tmp → rename). Loads are
 * zod-validated; a corrupt document is quarantined and restored from the most
 * recent backup when possible.
 */
export class StorageService {
  private readonly pending = new Map<CollectionName, PendingWrite>();
  /** Collections whose most recent write attempt failed. */
  private readonly failing = new Set<CollectionName>();
  private writeListener: ((event: SaveStatusEvent) => void) | null = null;

  constructor(
    private readonly dataDir: string,
    private readonly backups: BackupService,
    private readonly debounceMs = 300,
  ) {}

  /**
   * Observer for disk-write health: called with `ok: false` on every failed
   * flush and with `ok: true` once writing works again after failures.
   * Wired to the logger + a renderer push in the main bootstrap.
   */
  setWriteListener(listener: (event: SaveStatusEvent) => void): void {
    this.writeListener = listener;
  }

  private docPath(name: CollectionName): string {
    return join(this.dataDir, `${name}.json`);
  }

  /** Create the directory skeleton and meta document if absent. */
  init(): void {
    mkdirSync(join(this.dataDir, 'blobs'), { recursive: true });
    const metaPath = join(this.dataDir, 'workspace.json');
    if (!existsSync(metaPath)) {
      this.atomicWriteSync(metaPath, { schemaVersion: SCHEMA_VERSION });
    }
  }

  hasWorkspace(): boolean {
    return existsSync(this.docPath('projects'));
  }

  async loadWorkspace(): Promise<LoadResult> {
    if (!this.hasWorkspace()) return { workspace: null, warnings: [] };
    const warnings: string[] = [];

    const metaRaw = await this.readDocument('workspace.json', warnings);
    if (metaRaw !== null) {
      const meta = workspaceMetaSchema.safeParse(metaRaw);
      if (meta.success && meta.data.schemaVersion > SCHEMA_VERSION) {
        warnings.push(
          `Workspace schema v${meta.data.schemaVersion} is newer than this app (v${SCHEMA_VERSION}); loading best-effort`,
        );
      }
    }

    const projects = await this.loadDocument('projects.json', projectsFileSchema, [], warnings);
    const tasks = await this.loadDocument('tasks.json', tasksFileSchema, [], warnings);
    const files = await this.loadDocument('files.json', filesFileSchema, [], warnings);
    // Absent on every workspace written before 2.0 — loadDocument treats a
    // missing document as empty rather than corruption, so upgrading is silent.
    const contacts = await this.loadDocument('contacts.json', contactsFileSchema, [], warnings);
    const settings = await this.loadDocument(
      'settings.json',
      settingsSchema,
      { ...DEFAULT_SETTINGS },
      warnings,
    );

    const normalized = normalizeWorkspace(projects, tasks, files, contacts, settings);
    return { workspace: normalized.workspace, warnings: [...warnings, ...normalized.warnings] };
  }

  /** Write a full workspace immediately (first-run seeding, import). */
  async saveWorkspaceNow(workspace: Workspace): Promise<void> {
    this.init();
    await Promise.all([
      this.atomicWrite(this.docPath('projects'), workspace.projects),
      this.atomicWrite(this.docPath('tasks'), workspace.tasks),
      this.atomicWrite(this.docPath('files'), workspace.files),
      this.atomicWrite(this.docPath('contacts'), workspace.contacts),
      this.atomicWrite(this.docPath('settings'), workspace.settings),
    ]);
  }

  /**
   * The guarded entry point for renderer-originated saves (the IPC boundary):
   * screens the payload (schema gate + shrink tripwire, see write-guard.ts)
   * and schedules only the accepted collections. Returns the rejections so
   * the caller can surface them — a rejected write means renderer memory and
   * disk have diverged, which the user must hear about.
   */
  savePayload(payload: Record<string, unknown>): RejectedWrite[] {
    const screened = screenWorkspaceSave(payload, (name) => this.currentCount(name));
    for (const [name, data] of screened.accepted) this.scheduleSave(name, data);
    return screened.rejected;
  }

  /**
   * Entry count of the pending (unflushed) or on-disk document; null when the
   * document is missing, unreadable, or not a list. Feeds the shrink tripwire
   * — "unknown" never blocks a write, since the load path already handles
   * corrupt documents.
   */
  private currentCount(name: CollectionName): number | null {
    const pending = this.pending.get(name);
    if (pending !== undefined) {
      return Array.isArray(pending.data) ? pending.data.length : null;
    }
    try {
      const raw = JSON.parse(readFileSync(this.docPath(name), 'utf8')) as unknown;
      return Array.isArray(raw) ? raw.length : null;
    } catch {
      return null;
    }
  }

  /** Debounced write-through; trusted callers only — savePayload is the guarded path. */
  scheduleSave(name: CollectionName, data: unknown): void {
    const existing = this.pending.get(name);
    if (existing !== undefined) clearTimeout(existing.timer);
    const timer = setTimeout(() => {
      void this.flushOne(name);
    }, this.debounceMs);
    // Don't hold the process open just for a pending debounce; we flush
    // explicitly on quit.
    timer.unref();
    this.pending.set(name, { timer, data });
  }

  private async flushOne(name: CollectionName): Promise<void> {
    const entry = this.pending.get(name);
    if (entry === undefined) return;
    this.pending.delete(name);
    clearTimeout(entry.timer);
    try {
      await this.atomicWrite(this.docPath(name), entry.data);
      if (this.failing.delete(name) && this.failing.size === 0) {
        this.writeListener?.({ ok: true });
      }
    } catch (err) {
      // Never lose the data to a failed write: keep it pending so the retry
      // timer, the next user edit, or quit-time flushAll gets another shot —
      // unless a newer save for this collection arrived while we were writing.
      this.failing.add(name);
      if (!this.pending.has(name)) {
        const timer = setTimeout(() => {
          void this.flushOne(name);
        }, WRITE_RETRY_MS);
        timer.unref();
        this.pending.set(name, { timer, data: entry.data });
      }
      this.writeListener?.({
        ok: false,
        name,
        message: err instanceof Error ? err.message : 'unknown write error',
      });
    }
  }

  /** Flush every pending write; called on app quit. */
  async flushAll(): Promise<void> {
    const names = [...this.pending.keys()];
    await Promise.all(names.map((n) => this.flushOne(n)));
  }

  pendingCount(): number {
    return this.pending.size;
  }

  private async atomicWrite(path: string, data: unknown): Promise<void> {
    const tmp = `${path}.tmp`;
    await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    await rename(tmp, path);
  }

  private atomicWriteSync(path: string, data: unknown): void {
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    renameSync(tmp, path);
  }

  private async readDocument(fileName: string, warnings: string[]): Promise<unknown> {
    const path = join(this.dataDir, fileName);
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(await readFile(path, 'utf8')) as unknown;
    } catch {
      warnings.push(`${fileName} is not valid JSON`);
      return null;
    }
  }

  private async loadDocument<T>(
    fileName: string,
    schema: ZodType<T, ZodTypeDef, unknown>,
    fallback: T,
    warnings: string[],
  ): Promise<T> {
    // Missing document (e.g. settings on an older workspace) is not corruption.
    if (!existsSync(join(this.dataDir, fileName))) return fallback;

    const raw = await this.readDocument(fileName, warnings);
    if (raw !== null) {
      const parsed = schema.safeParse(raw);
      if (parsed.success) return parsed.data;
      warnings.push(`${fileName} failed validation`);
    }

    // Corrupt: quarantine, then try the newest backup.
    this.quarantine(fileName);
    const backupPath = this.backups.latestBackupOf(fileName);
    if (backupPath !== null) {
      try {
        const restored = JSON.parse(await readFile(backupPath, 'utf8')) as unknown;
        const parsed = schema.safeParse(restored);
        if (parsed.success) {
          warnings.push(`${fileName} restored from backup`);
          await this.atomicWrite(join(this.dataDir, fileName), parsed.data);
          return parsed.data;
        }
      } catch {
        // fall through to fallback
      }
    }
    warnings.push(`${fileName} could not be recovered; starting that document empty`);
    return fallback;
  }

  private quarantine(fileName: string): void {
    const path = join(this.dataDir, fileName);
    if (!existsSync(path)) return;
    const stamp = Date.now();
    try {
      copyFileSync(path, `${path}.corrupt-${stamp}`);
    } catch {
      // Quarantine is best-effort; never block loading on it.
    }
  }
}
