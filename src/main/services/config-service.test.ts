import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ConfigService } from './config-service';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ariadne-config-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('ConfigService', () => {
  it('defaults dataDir to <userData>/data when no config exists', () => {
    const svc = new ConfigService(dir);
    expect(svc.load().dataDir).toBe(join(dir, 'data'));
  });

  it('resolveDataDir persists the default on first run', () => {
    const svc = new ConfigService(dir);
    const resolved = svc.resolveDataDir();
    expect(resolved).toBe(join(dir, 'data'));
    expect(existsSync(join(dir, 'config.json'))).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'))).toEqual({
      dataDir: join(dir, 'data'),
    });
  });

  it('round-trips saved config including window bounds', () => {
    const svc = new ConfigService(dir);
    const custom = {
      dataDir: join(dir, 'elsewhere'),
      windowBounds: { x: 1, y: 2, width: 1200, height: 800 },
    };
    svc.save(custom);
    expect(svc.load()).toEqual(custom);
    expect(svc.resolveDataDir()).toBe(custom.dataDir);
  });

  it('remembers the menu-bar quick-add project, and drops a junk one (D51)', () => {
    const svc = new ConfigService(dir);
    svc.save({ dataDir: join(dir, 'd'), lastQuickAddProjectId: 'p3' });
    expect(svc.load().lastQuickAddProjectId).toBe('p3');
    writeFileSync(
      join(dir, 'config.json'),
      JSON.stringify({ dataDir: join(dir, 'd'), lastQuickAddProjectId: 42 }),
    );
    expect(svc.load()).toEqual({ dataDir: join(dir, 'd') });
  });

  it('falls back to the default on corrupt or invalid config', () => {
    writeFileSync(join(dir, 'config.json'), '{not json', 'utf8');
    expect(new ConfigService(dir).load().dataDir).toBe(join(dir, 'data'));

    writeFileSync(join(dir, 'config.json'), JSON.stringify({ dataDir: '' }), 'utf8');
    expect(new ConfigService(dir).load().dataDir).toBe(join(dir, 'data'));

    writeFileSync(join(dir, 'config.json'), JSON.stringify(null), 'utf8');
    expect(new ConfigService(dir).load().dataDir).toBe(join(dir, 'data'));
  });

  it('drops invalid window bounds instead of passing them to BrowserWindow', () => {
    const dataDir = join(dir, 'data');

    // Wrong types: bounds vanish, dataDir survives.
    writeFileSync(
      join(dir, 'config.json'),
      JSON.stringify({ dataDir, windowBounds: { x: 0, y: 0, width: 'big', height: 900 } }),
      'utf8',
    );
    expect(new ConfigService(dir).load()).toEqual({ dataDir });

    // Absurdly small / negative sizes: also dropped (min 400×300).
    writeFileSync(
      join(dir, 'config.json'),
      JSON.stringify({ dataDir, windowBounds: { x: 10, y: 10, width: 20, height: -5 } }),
      'utf8',
    );
    expect(new ConfigService(dir).load()).toEqual({ dataDir });

    // Sane bounds still pass untouched.
    const bounds = { x: -100, y: 40, width: 1200, height: 800 }; // negative x = left monitor
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ dataDir, windowBounds: bounds }));
    expect(new ConfigService(dir).load()).toEqual({ dataDir, windowBounds: bounds });
  });
});

describe('ConfigService.changeDataDir', () => {
  function seedDataDir(base: string): string {
    const dataDir = join(base, 'data');
    mkdirSync(join(dataDir, 'blobs'), { recursive: true });
    writeFileSync(join(dataDir, 'projects.json'), '[{"id":"p1"}]', 'utf8');
    writeFileSync(join(dataDir, 'tasks.json'), '[]', 'utf8');
    writeFileSync(join(dataDir, 'blobs', 'b1.pdf'), 'bytes', 'utf8');
    return dataDir;
  }

  it('migrates documents and blobs into an empty target', () => {
    const svc = new ConfigService(dir);
    const dataDir = seedDataDir(dir);
    const target = join(dir, 'synced');

    expect(svc.changeDataDir(dataDir, target)).toBe('migrated');
    expect(readFileSync(join(target, 'projects.json'), 'utf8')).toBe('[{"id":"p1"}]');
    expect(readFileSync(join(target, 'blobs', 'b1.pdf'), 'utf8')).toBe('bytes');
    expect(svc.load().dataDir).toBe(target);
  });

  it('loads in place when the target already holds a workspace', () => {
    const svc = new ConfigService(dir);
    const dataDir = seedDataDir(dir);
    const target = join(dir, 'other');
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'projects.json'), '[{"id":"other"}]', 'utf8');

    expect(svc.changeDataDir(dataDir, target)).toBe('loaded');
    // Existing workspace untouched.
    expect(readFileSync(join(target, 'projects.json'), 'utf8')).toBe('[{"id":"other"}]');
    expect(svc.load().dataDir).toBe(target);
  });

  it('is a no-op for the same directory', () => {
    const svc = new ConfigService(dir);
    const dataDir = seedDataDir(dir);
    expect(svc.changeDataDir(dataDir, dataDir)).toBe('unchanged');
  });
});
