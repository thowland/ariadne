import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { locateDataDir, looksLikeWorkspace, userDataCandidates } from './locate';

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'ariadne-home-'));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

/** A workspace directory is one with a projects.json in it. */
function makeWorkspace(dir: string): string {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'projects.json'), '[]', 'utf8');
  return dir;
}

function writeConfig(userData: string, dataDir: string): void {
  mkdirSync(userData, { recursive: true });
  writeFileSync(join(userData, 'config.json'), JSON.stringify({ dataDir }), 'utf8');
}

describe('userDataCandidates', () => {
  it('reproduces Electron’s path rule per platform', () => {
    expect(userDataCandidates('darwin', '/Users/x')).toEqual([
      '/Users/x/Library/Application Support/Ariadne',
      '/Users/x/Library/Application Support/ariadne',
    ]);
    expect(userDataCandidates('linux', '/home/x')).toEqual([
      '/home/x/.config/Ariadne',
      '/home/x/.config/ariadne',
    ]);
    expect(userDataCandidates('win32', 'C:\\Users\\x', { APPDATA: 'C:\\Roaming' })[0]).toContain(
      'C:\\Roaming',
    );
  });

  it('honours XDG_CONFIG_HOME and a missing APPDATA', () => {
    expect(userDataCandidates('linux', '/home/x', { XDG_CONFIG_HOME: '/cfg' })[0]).toBe(
      '/cfg/Ariadne',
    );
    expect(userDataCandidates('win32', 'C:\\Users\\x')[0]).toContain('AppData');
  });

  it('tries the packaged name before the dev one', () => {
    // A packaged install and a `npm run dev` checkout both exist on this
    // machine; the real one is the packaged one.
    const [first, second] = userDataCandidates('darwin', '/Users/x');
    expect(first).toContain('/Ariadne');
    expect(second).toContain('/ariadne');
  });
});

describe('locateDataDir', () => {
  it('prefers ARIADNE_DATA_DIR over anything on disk', () => {
    writeConfig(
      join(home, 'Library/Application Support/Ariadne'),
      makeWorkspace(join(home, 'real')),
    );
    expect(locateDataDir('darwin', home, { ARIADNE_DATA_DIR: '/somewhere/else' })).toEqual({
      dataDir: '/somewhere/else',
      via: 'env',
    });
  });

  it('reads the data folder out of config.json, which Settings can move', () => {
    const moved = makeWorkspace(join(home, 'Dropbox', 'ariadne'));
    writeConfig(join(home, 'Library/Application Support/Ariadne'), moved);
    expect(locateDataDir('darwin', home, {})).toEqual({ dataDir: moved, via: 'config' });
  });

  it('falls back to the default folder when there is no config', () => {
    const fallback = makeWorkspace(join(home, 'Library/Application Support/ariadne/data'));
    const found = locateDataDir('darwin', home, {});
    expect(found?.via).toBe('default');
    // Compared case-insensitively on purpose: macOS volumes usually are, so
    // the packaged spelling "Ariadne" resolves to a folder created as
    // "ariadne" and either answer points at the same directory.
    expect(found?.dataDir.toLowerCase()).toBe(fallback.toLowerCase());
    expect(looksLikeWorkspace(found?.dataDir ?? '')).toBe(true);
  });

  it('ignores a config pointing at a folder with no workspace in it', () => {
    writeConfig(join(home, 'Library/Application Support/Ariadne'), join(home, 'gone'));
    const fallback = makeWorkspace(join(home, 'Library/Application Support/Ariadne/data'));
    expect(locateDataDir('darwin', home, {})?.dataDir).toBe(fallback);
  });

  it('survives a corrupt config rather than failing to start', () => {
    const userData = join(home, 'Library/Application Support/Ariadne');
    mkdirSync(userData, { recursive: true });
    writeFileSync(join(userData, 'config.json'), '{ not json', 'utf8');
    const fallback = makeWorkspace(join(userData, 'data'));
    expect(locateDataDir('darwin', home, {})?.dataDir).toBe(fallback);
  });

  it('is null when Ariadne has never run here', () => {
    expect(locateDataDir('darwin', home, {})).toBeNull();
  });
});

describe('looksLikeWorkspace', () => {
  it('is the presence of projects.json, the same check the app makes', () => {
    expect(looksLikeWorkspace(makeWorkspace(join(home, 'w')))).toBe(true);
    expect(looksLikeWorkspace(join(home, 'nope'))).toBe(false);
  });
});
