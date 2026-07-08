import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LoggerService } from './logger-service';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ariadne-log-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('LoggerService', () => {
  it('appends timestamped lines', () => {
    const svc = new LoggerService(dir, () => new Date('2026-07-08T12:00:00Z'));
    svc.info('app started');
    svc.error('something broke');
    const content = readFileSync(join(dir, 'logs', 'main.log'), 'utf8');
    expect(content).toBe(
      '2026-07-08T12:00:00.000Z [info] app started\n2026-07-08T12:00:00.000Z [error] something broke\n',
    );
  });

  it('rotates once past 1MB, keeping a single previous file', () => {
    const svc = new LoggerService(dir);
    const logPath = join(dir, 'logs', 'main.log');
    svc.info('seed');
    writeFileSync(logPath, 'x'.repeat(1_100_000), 'utf8');
    svc.info('after rotation');
    expect(existsSync(`${logPath}.1`)).toBe(true);
    expect(readFileSync(logPath, 'utf8')).toContain('after rotation');
    expect(readFileSync(logPath, 'utf8').length).toBeLessThan(1000);
  });

  it('never throws even when the log location is unusable', () => {
    // A regular file where the userData dir should be → mkdir fails (ENOTDIR).
    const blocker = join(dir, 'blocker');
    writeFileSync(blocker, 'not a directory', 'utf8');
    const svc = new LoggerService(blocker);
    expect(() => {
      svc.info('ignored');
    }).not.toThrow();
  });
});
