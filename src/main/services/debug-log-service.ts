import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

import type { DebugLogCategory } from '@shared/ipc-contract';

const MAX_BYTES = 5_242_880; // rotate at 5 MB, keep one previous file
const MAX_LINE_CHARS = 4000;

export const DEBUG_LOG_FILE = 'ariadne-debug.log';

/**
 * The opt-in debug log (spec D18): timestamped, category-tagged lines
 * describing app activity (edits, navigation, backups, Todoist sync, disk
 * saves, …). Off by default; the Settings page toggles it and picks the
 * folder. Synchronous like LoggerService — a lost debug line matters less
 * than a corrupted one, and writes are small and rare on a single-user app.
 */
export class DebugLogService {
  private enabled = false;
  private dir: string;

  constructor(
    private readonly defaultDir: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.dir = defaultDir;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  defaultLogDir(): string {
    return this.defaultDir;
  }

  /** Effective log file path under the configured (or default) folder. */
  logPath(): string {
    return join(this.dir, DEBUG_LOG_FILE);
  }

  /**
   * Apply `debugLogging`/`debugLogDir` from an untrusted settings object (the
   * renderer save payload, or settings.json contents). Anything malformed
   * falls back to disabled / the default folder. Enable, disable, and folder
   * changes each leave a line so the log explains its own gaps.
   */
  configure(raw: unknown): void {
    if (typeof raw !== 'object' || raw === null) return;
    const s = raw as Record<string, unknown>;
    const nextEnabled = s.debugLogging === true;
    const nextDir =
      typeof s.debugLogDir === 'string' && s.debugLogDir.trim() !== ''
        ? s.debugLogDir
        : this.defaultDir;
    if (this.enabled && !nextEnabled) this.log('app', 'debug logging disabled');
    const wasEnabled = this.enabled;
    const dirChanged = nextDir !== this.dir;
    this.dir = nextDir;
    this.enabled = nextEnabled;
    if (nextEnabled && !wasEnabled) this.log('app', `debug logging enabled → ${this.logPath()}`);
    else if (nextEnabled && dirChanged) this.log('app', `log folder changed → ${this.logPath()}`);
  }

  /** Startup: pick up the persisted setting from the workspace, best-effort. */
  configureFromSettingsFile(dataDir: string): void {
    try {
      this.configure(JSON.parse(readFileSync(join(dataDir, 'settings.json'), 'utf8')));
    } catch {
      // Missing/corrupt settings — logging stays off until the renderer saves.
    }
  }

  log(category: DebugLogCategory, message: string): void {
    if (!this.enabled) return;
    try {
      mkdirSync(this.dir, { recursive: true });
      this.rotateIfNeeded();
      const line = message.replace(/\s*\n\s*/g, ' | ').slice(0, MAX_LINE_CHARS);
      appendFileSync(this.logPath(), `${this.now().toISOString()} [${category}] ${line}\n`, 'utf8');
    } catch {
      // Debug logging must never take the app down.
    }
  }

  private rotateIfNeeded(): void {
    const path = this.logPath();
    if (!existsSync(path)) return;
    if (statSync(path).size < MAX_BYTES) return;
    renameSync(path, `${path}.1`);
  }
}
