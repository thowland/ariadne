import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEBUG_LOG_FILE, DebugLogService } from './debug-log-service';

let dir: string;
let defaultDir: string;

const FIXED_NOW = (): Date => new Date('2026-07-08T12:00:00Z');

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ariadne-debug-log-'));
  defaultDir = join(dir, 'logs');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('DebugLogService', () => {
  it('is off by default and writes nothing', () => {
    const svc = new DebugLogService(defaultDir);
    svc.log('app', 'should not appear');
    expect(svc.isEnabled()).toBe(false);
    expect(existsSync(svc.logPath())).toBe(false);
  });

  it('writes timestamped, categorized lines once enabled', () => {
    const svc = new DebugLogService(defaultDir, FIXED_NOW);
    svc.configure({ debugLogging: true, debugLogDir: null });
    svc.log('backup', 'backup complete: /x');
    const content = readFileSync(join(defaultDir, DEBUG_LOG_FILE), 'utf8');
    expect(content).toBe(
      '2026-07-08T12:00:00.000Z [app] debug logging enabled → ' +
        `${join(defaultDir, DEBUG_LOG_FILE)}\n` +
        '2026-07-08T12:00:00.000Z [backup] backup complete: /x\n',
    );
  });

  it('records the disable transition, then goes silent', () => {
    const svc = new DebugLogService(defaultDir, FIXED_NOW);
    svc.configure({ debugLogging: true, debugLogDir: null });
    svc.configure({ debugLogging: false, debugLogDir: null });
    svc.log('app', 'after disable');
    const content = readFileSync(svc.logPath(), 'utf8');
    expect(content).toContain('[app] debug logging disabled');
    expect(content).not.toContain('after disable');
    expect(svc.isEnabled()).toBe(false);
  });

  it('honors a custom folder and logs folder changes', () => {
    const custom = join(dir, 'custom');
    const svc = new DebugLogService(defaultDir, FIXED_NOW);
    svc.configure({ debugLogging: true, debugLogDir: custom });
    svc.log('activity', 'hello');
    expect(svc.logPath()).toBe(join(custom, DEBUG_LOG_FILE));
    expect(readFileSync(svc.logPath(), 'utf8')).toContain('[activity] hello');

    svc.configure({ debugLogging: true, debugLogDir: null });
    expect(svc.logPath()).toBe(join(defaultDir, DEBUG_LOG_FILE));
    expect(readFileSync(svc.logPath(), 'utf8')).toContain('log folder changed');
  });

  it('falls back to the default folder for malformed debugLogDir values', () => {
    const svc = new DebugLogService(defaultDir);
    svc.configure({ debugLogging: true, debugLogDir: '   ' });
    expect(svc.logPath()).toBe(join(defaultDir, DEBUG_LOG_FILE));
    svc.configure({ debugLogging: true, debugLogDir: 42 });
    expect(svc.logPath()).toBe(join(defaultDir, DEBUG_LOG_FILE));
  });

  it('ignores configure payloads that are not objects', () => {
    const svc = new DebugLogService(defaultDir);
    svc.configure({ debugLogging: true });
    svc.configure(null);
    svc.configure('nonsense');
    expect(svc.isEnabled()).toBe(true);
  });

  it('reads the persisted setting from settings.json at startup', () => {
    const dataDir = join(dir, 'data');
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(
      join(dataDir, 'settings.json'),
      JSON.stringify({ debugLogging: true, debugLogDir: null }),
      'utf8',
    );
    const svc = new DebugLogService(defaultDir);
    svc.configureFromSettingsFile(dataDir);
    expect(svc.isEnabled()).toBe(true);
  });

  it('stays off when settings.json is missing or corrupt', () => {
    const svc = new DebugLogService(defaultDir);
    svc.configureFromSettingsFile(join(dir, 'nowhere'));
    expect(svc.isEnabled()).toBe(false);
    const dataDir = join(dir, 'data');
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(join(dataDir, 'settings.json'), '{not json', 'utf8');
    svc.configureFromSettingsFile(dataDir);
    expect(svc.isEnabled()).toBe(false);
  });

  it('flattens multi-line messages into one log line', () => {
    const svc = new DebugLogService(defaultDir, FIXED_NOW);
    svc.configure({ debugLogging: true });
    svc.log('storage', 'line one\n  line two');
    const lines = readFileSync(svc.logPath(), 'utf8').trimEnd().split('\n');
    expect(lines.at(-1)).toBe('2026-07-08T12:00:00.000Z [storage] line one | line two');
  });

  it('rotates once past the size cap, keeping a single previous file', () => {
    const svc = new DebugLogService(defaultDir);
    svc.configure({ debugLogging: true });
    svc.log('app', 'seed');
    writeFileSync(svc.logPath(), 'x'.repeat(5_300_000), 'utf8');
    svc.log('app', 'after rotation');
    expect(existsSync(`${svc.logPath()}.1`)).toBe(true);
    const content = readFileSync(svc.logPath(), 'utf8');
    expect(content).toContain('after rotation');
    expect(content.length).toBeLessThan(1000);
  });

  it('never throws even when the log location is unusable', () => {
    // A regular file where the log dir should be → mkdir fails (ENOTDIR).
    const blocker = join(dir, 'blocker');
    writeFileSync(blocker, 'not a directory', 'utf8');
    const svc = new DebugLogService(blocker);
    svc.configure({ debugLogging: true });
    expect(() => {
      svc.log('app', 'ignored');
    }).not.toThrow();
  });
});
