import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import type { AppConfig } from '@shared/types';
import { z } from 'zod';

/** Fallback window size, shared with createWindow (main/index.ts). */
export const DEFAULT_WINDOW_BOUNDS = { width: 1440, height: 900 } as const;

/**
 * config.json is the one persisted document a user might plausibly hand-edit
 * (it points at the data directory), so it gets the same zod treatment as the
 * workspace documents. Bounds that would produce an unusable window (wrong
 * types, sizes below 400×300) are dropped wholesale — createWindow then falls
 * back to defaults. Negative x/y are legitimate (multi-monitor layouts).
 */
const windowBoundsSchema = z
  .object({
    x: z.number().int(),
    y: z.number().int(),
    width: z.number().int().min(400),
    height: z.number().int().min(300),
  })
  .optional()
  .catch(undefined);

const appConfigSchema = z.object({
  dataDir: z.string().min(1).catch(''),
  windowBounds: windowBoundsSchema,
});

/**
 * Owns userData/config.json — the pointer to the active data directory plus
 * window state. Synchronous on purpose: it is read once at startup before any
 * window exists and written rarely.
 */
export class ConfigService {
  private readonly configPath: string;
  private readonly defaultDataDir: string;

  constructor(private readonly userDataDir: string) {
    this.configPath = join(userDataDir, 'config.json');
    this.defaultDataDir = join(userDataDir, 'data');
  }

  load(): AppConfig {
    try {
      const raw: unknown = JSON.parse(readFileSync(this.configPath, 'utf8'));
      const parsed = appConfigSchema.safeParse(raw);
      if (parsed.success) {
        return {
          dataDir: parsed.data.dataDir !== '' ? parsed.data.dataDir : this.defaultDataDir,
          ...(parsed.data.windowBounds !== undefined
            ? { windowBounds: parsed.data.windowBounds }
            : {}),
        };
      }
    } catch {
      // Missing or unreadable config falls through to the default.
    }
    return { dataDir: this.defaultDataDir };
  }

  save(config: AppConfig): void {
    mkdirSync(this.userDataDir, { recursive: true });
    const tmp = `${this.configPath}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    renameSync(tmp, this.configPath);
  }

  /** Resolve the active data dir, persisting the default on first run. */
  resolveDataDir(): string {
    const config = this.load();
    if (!existsSync(this.configPath)) this.save(config);
    return config.dataDir;
  }

  /**
   * Point the app at `target`. If the folder already holds a workspace it is
   * loaded in place; otherwise the current workspace documents and blobs are
   * migrated (copied) into it. Takes effect on next launch.
   */
  changeDataDir(currentDataDir: string, target: string): 'loaded' | 'migrated' | 'unchanged' {
    if (target === currentDataDir) return 'unchanged';
    mkdirSync(target, { recursive: true });
    const targetHasWorkspace = existsSync(join(target, 'projects.json'));
    if (!targetHasWorkspace) {
      for (const doc of [
        'workspace.json',
        'projects.json',
        'tasks.json',
        'files.json',
        'settings.json',
      ]) {
        const source = join(currentDataDir, doc);
        if (existsSync(source)) copyFileSync(source, join(target, doc));
      }
      const blobsDir = join(currentDataDir, 'blobs');
      if (existsSync(blobsDir)) cpSync(blobsDir, join(target, 'blobs'), { recursive: true });
    }
    this.save({ ...this.load(), dataDir: target });
    return targetHasWorkspace ? 'loaded' : 'migrated';
  }
}
