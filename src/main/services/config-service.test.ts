import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

  it('falls back to the default on corrupt or invalid config', () => {
    writeFileSync(join(dir, 'config.json'), '{not json', 'utf8');
    expect(new ConfigService(dir).load().dataDir).toBe(join(dir, 'data'));

    writeFileSync(join(dir, 'config.json'), JSON.stringify({ dataDir: '' }), 'utf8');
    expect(new ConfigService(dir).load().dataDir).toBe(join(dir, 'data'));

    writeFileSync(join(dir, 'config.json'), JSON.stringify(null), 'utf8');
    expect(new ConfigService(dir).load().dataDir).toBe(join(dir, 'data'));
  });
});
