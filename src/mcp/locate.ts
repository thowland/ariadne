import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Finding the workspace from outside Electron (D39).
 *
 * The MCP server is a plain Node process, so it cannot ask `app.getPath`
 * where the user data lives. It reproduces Electron's own rule instead, then
 * reads the same `config.json` the app writes to learn where the workspace
 * actually is — which is usually *not* under the user-data directory, because
 * the data folder is configurable in Settings.
 */

/** Both names Electron might have used: packaged productName, then dev name. */
const APP_NAMES = ['Ariadne', 'ariadne'] as const;

/**
 * Where Electron would put `userData`, most likely first. Pure, so the
 * platform rules are testable without being on that platform.
 */
export function userDataCandidates(
  platform: string,
  home: string,
  env: Record<string, string | undefined> = {},
): string[] {
  return APP_NAMES.map((name) => {
    if (platform === 'darwin') return join(home, 'Library', 'Application Support', name);
    if (platform === 'win32') return join(env.APPDATA ?? join(home, 'AppData', 'Roaming'), name);
    return join(env.XDG_CONFIG_HOME ?? join(home, '.config'), name);
  });
}

/** A workspace directory is one with a projects.json in it. */
export function looksLikeWorkspace(dir: string): boolean {
  return existsSync(join(dir, 'projects.json'));
}

export interface LocateResult {
  dataDir: string;
  /** How it was found, for the "not found" message and for `workspace_info`. */
  via: 'env' | 'config' | 'default';
}

/**
 * The workspace directory, or null when Ariadne has never run here.
 *
 * `ARIADNE_DATA_DIR` wins, so a second workspace (or a test fixture) can be
 * pointed at without touching the app's own configuration.
 */
export function locateDataDir(
  platform: string,
  home: string,
  env: Record<string, string | undefined> = {},
): LocateResult | null {
  const override = env.ARIADNE_DATA_DIR;
  if (override !== undefined && override !== '') return { dataDir: override, via: 'env' };

  const candidates = userDataCandidates(platform, home, env);
  // config.json is authoritative: Settings can move the data folder anywhere.
  for (const userData of candidates) {
    const configPath = join(userData, 'config.json');
    if (!existsSync(configPath)) continue;
    try {
      const raw: unknown = JSON.parse(readFileSync(configPath, 'utf8'));
      const dataDir =
        typeof raw === 'object' && raw !== null
          ? (raw as { dataDir?: unknown }).dataDir
          : undefined;
      if (typeof dataDir === 'string' && dataDir !== '' && looksLikeWorkspace(dataDir)) {
        return { dataDir, via: 'config' };
      }
    } catch {
      // A corrupt config is not fatal here; fall through to the default.
    }
  }
  // No usable config: the default location, if something is actually there.
  for (const userData of candidates) {
    const fallback = join(userData, 'data');
    if (looksLikeWorkspace(fallback)) return { dataDir: fallback, via: 'default' };
  }
  return null;
}
