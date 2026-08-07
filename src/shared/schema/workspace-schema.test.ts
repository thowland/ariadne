import { describe, expect, it } from 'vitest';

import { seedWorkspace } from '../domain/seed';
import { DEFAULT_SETTINGS } from '../types';

import {
  filesFileSchema,
  normalizeWorkspace,
  projectsFileSchema,
  settingsSchema,
  tasksFileSchema,
  workspaceMetaSchema,
} from './workspace-schema';

const TODAY = '2026-07-08';

describe('document schemas', () => {
  it('round-trip the seed dataset unchanged', () => {
    const ws = seedWorkspace(TODAY);
    expect(projectsFileSchema.parse(ws.projects)).toEqual(ws.projects);
    expect(tasksFileSchema.parse(ws.tasks)).toEqual(ws.tasks);
    expect(filesFileSchema.parse(ws.files)).toEqual(ws.files);
    expect(settingsSchema.parse(ws.settings)).toEqual(ws.settings);
  });

  it('defaults malformed optional fields instead of failing the document', () => {
    const parsed = tasksFileSchema.parse([
      {
        id: 't1',
        projectId: 'p1',
        title: 42, // wrong type
        status: 'NotAStatus',
        priority: 'Urgent',
        dueDate: 'yesterday',
        createdAt: TODAY,
        subtasks: 'nope',
      },
    ]);
    expect(parsed[0]).toMatchObject({
      title: '',
      status: 'Todo',
      priority: 'Medium',
      dueDate: null,
      completedAt: null,
      tags: [],
      dependsOn: [],
      subtasks: [],
      links: [],
    });
  });

  it('keeps archived flags, leaves them absent for pre-1.6 documents, defaults junk', () => {
    const base = { id: 'p1', createdAt: TODAY };
    const parsed = projectsFileSchema.parse([
      base,
      { ...base, id: 'p2', archived: true },
      { ...base, id: 'p3', archived: 'yes' },
    ]);
    expect(parsed[0]).not.toHaveProperty('archived');
    expect(parsed[1]?.archived).toBe(true);
    expect(parsed[2]?.archived).toBe(false);
  });

  it('rejects entities without ids or valid createdAt', () => {
    expect(tasksFileSchema.safeParse([{ projectId: 'p1', createdAt: TODAY }]).success).toBe(false);
    expect(tasksFileSchema.safeParse([{ id: 't1', projectId: 'p1' }]).success).toBe(false);
    expect(projectsFileSchema.safeParse([{ id: '', createdAt: TODAY }]).success).toBe(false);
  });

  it('defaults the debug-logging fields absent from pre-1.13 settings documents', () => {
    const pre113: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    delete pre113.debugLogging;
    delete pre113.debugLogDir;
    const parsed = settingsSchema.parse(pre113);
    expect(parsed.debugLogging).toBe(false);
    expect(parsed.debugLogDir).toBeNull();
    // Malformed values clamp to the safe defaults instead of failing the load.
    expect(settingsSchema.parse({ debugLogging: 'yes', debugLogDir: '' })).toMatchObject({
      debugLogging: false,
      debugLogDir: null,
    });
  });

  it('strips unknown keys (forward compatibility)', () => {
    const parsed = settingsSchema.parse({
      ...DEFAULT_SETTINGS,
      someFutureFlag: true,
    });
    expect(parsed).toEqual(DEFAULT_SETTINGS);
  });

  it('validates workspace meta', () => {
    expect(workspaceMetaSchema.parse({ schemaVersion: 1 }).schemaVersion).toBe(1);
    expect(workspaceMetaSchema.safeParse({ schemaVersion: 'one' }).success).toBe(false);
  });
});

describe('normalizeWorkspace', () => {
  const ws = seedWorkspace(TODAY);

  it('drops orphaned tasks and files', () => {
    const orphanTask = { ...ws.tasks[0]!, id: 'orphan', projectId: 'ghost' };
    const orphanFile = { ...ws.files[0]!, id: 'orphanf', projectId: 'ghost' };
    const { workspace, warnings } = normalizeWorkspace(
      structuredClone(ws.projects),
      [...structuredClone(ws.tasks), orphanTask],
      [...structuredClone(ws.files), orphanFile],
      { ...ws.settings },
    );
    expect(workspace.tasks.some((t) => t.id === 'orphan')).toBe(false);
    expect(workspace.files.some((f) => f.id === 'orphanf')).toBe(false);
    expect(warnings.length).toBeGreaterThanOrEqual(2);
  });

  it('scrubs dangling, cross-project, and self dependencies', () => {
    const tasks = structuredClone(ws.tasks);
    const t = tasks.find((x) => x.id === 't2')!; // p1 task
    t.dependsOn = ['t1', 'ghost', 't7', 't2']; // valid, missing, other-project (p2), self
    const { workspace } = normalizeWorkspace(
      structuredClone(ws.projects),
      tasks,
      structuredClone(ws.files),
      { ...ws.settings },
    );
    expect(workspace.tasks.find((x) => x.id === 't2')?.dependsOn).toEqual(['t1']);
  });

  it('nulls dangling file→task links', () => {
    const files = structuredClone(ws.files);
    files[0]!.taskId = 'ghost-task';
    const { workspace } = normalizeWorkspace(
      structuredClone(ws.projects),
      structuredClone(ws.tasks),
      files,
      { ...ws.settings },
    );
    expect(workspace.files[0]?.taskId).toBeNull();
  });

  it('re-establishes the Done ⇔ completedAt invariant', () => {
    const tasks = structuredClone(ws.tasks);
    const done = tasks.find((t) => t.status === 'Done')!;
    done.completedAt = null;
    const open = tasks.find((t) => t.status === 'Todo')!;
    open.completedAt = TODAY;
    const { workspace } = normalizeWorkspace(
      structuredClone(ws.projects),
      tasks,
      structuredClone(ws.files),
      { ...ws.settings },
    );
    expect(workspace.tasks.find((t) => t.id === done.id)?.completedAt).not.toBeNull();
    expect(workspace.tasks.find((t) => t.id === open.id)?.completedAt).toBeNull();
  });
});

describe('task deferral history (D23)', () => {
  const base = { id: 't1', projectId: 'p1', createdAt: TODAY };

  it('round-trips a valid history and leaves pre-1.14 tasks untouched', () => {
    const deferrals = [{ from: '2026-07-01', to: '2026-07-05', on: '2026-07-01' }];
    expect(tasksFileSchema.parse([{ ...base, deferrals }])[0]?.deferrals).toEqual(deferrals);
    // Absent stays absent, so older documents round-trip byte-identical.
    expect(tasksFileSchema.parse([base])[0]).not.toHaveProperty('deferrals');
  });

  it('drops only the malformed entries, keeping the rest of the history', () => {
    const good = { from: '2026-07-01', to: '2026-07-05', on: '2026-07-01' };
    const parsed = tasksFileSchema.parse([
      {
        ...base,
        deferrals: [good, { from: 'nope', to: '2026-07-05', on: '2026-07-01' }, { from: 1 }],
      },
    ]);
    expect(parsed[0]?.deferrals).toEqual([good]);
  });

  it('discards a history that is not an array', () => {
    expect(tasksFileSchema.parse([{ ...base, deferrals: 'lots' }])[0]?.deferrals).toBeUndefined();
  });
});

describe('badgeMode (D28)', () => {
  it('defaults to none for a workspace saved before the setting existed', () => {
    expect(settingsSchema.parse({}).badgeMode).toBe('none');
  });

  it('falls back to none rather than rejecting an unknown value', () => {
    expect(settingsSchema.parse({ badgeMode: 'flashing' }).badgeMode).toBe('none');
  });

  it('keeps a valid value', () => {
    expect(settingsSchema.parse({ badgeMode: 'overdue' }).badgeMode).toBe('overdue');
    expect(settingsSchema.parse({ badgeMode: 'due' }).badgeMode).toBe('due');
  });
});
