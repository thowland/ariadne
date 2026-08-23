import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { seedWorkspace } from '@shared/domain/seed';
import { DEFAULT_SETTINGS } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readWorkspace } from './workspace';

const TODAY = '2026-07-08';
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ariadne-mcp-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Write a workspace the way the app does, one document per collection. */
function writeSeed(overrides: Partial<Record<string, unknown>> = {}): void {
  const ws = seedWorkspace(TODAY);
  const docs: Record<string, unknown> = {
    'projects.json': ws.projects,
    'tasks.json': ws.tasks,
    'files.json': ws.files,
    'contacts.json': ws.contacts,
    'settings.json': { ...ws.settings, todoistToken: 'SECRET-TOKEN', anthropicApiKey: 'sk-SECRET' },
    ...overrides,
  };
  for (const [name, value] of Object.entries(docs)) {
    writeFileSync(join(dir, name), JSON.stringify(value), 'utf8');
  }
}

describe('readWorkspace', () => {
  it('reads what the app wrote', () => {
    writeSeed();
    const ws = readWorkspace(dir);
    expect(ws.projects).toHaveLength(6);
    expect(ws.tasks).toHaveLength(30);
    expect(ws.contacts).toHaveLength(8);
  });

  it('never loads settings, which hold the API keys in plaintext (D10)', () => {
    writeSeed();
    const ws = readWorkspace(dir);
    expect(ws.settings).toEqual(DEFAULT_SETTINGS);
    expect(JSON.stringify(ws)).not.toContain('SECRET');
  });

  it('normalizes exactly as the app does, so the two never disagree', () => {
    const ws = seedWorkspace(TODAY);
    const orphan = { ...ws.tasks[0], id: 'orphan', projectId: 'ghost' };
    writeSeed({ 'tasks.json': [...ws.tasks, orphan] });
    expect(readWorkspace(dir).tasks.some((t) => t.id === 'orphan')).toBe(false);
  });

  it('treats a missing document as empty, not as a failure', () => {
    // A workspace written by a version before contacts existed (pre-2.0).
    writeSeed();
    rmSync(join(dir, 'contacts.json'));
    expect(readWorkspace(dir).contacts).toEqual([]);
  });

  it('survives a corrupt document instead of crashing the server', () => {
    writeSeed();
    writeFileSync(join(dir, 'tasks.json'), '{ not json', 'utf8');
    const ws = readWorkspace(dir);
    // The rest of the workspace still reads; only the broken part is empty.
    expect(ws.tasks).toEqual([]);
    expect(ws.projects).toHaveLength(6);
  });

  it('is empty, not an error, for a directory with nothing in it', () => {
    const ws = readWorkspace(dir);
    expect(ws.projects).toEqual([]);
    expect(ws.tasks).toEqual([]);
  });
});
