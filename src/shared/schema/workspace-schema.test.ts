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

  it('rejects entities without ids or valid createdAt', () => {
    expect(tasksFileSchema.safeParse([{ projectId: 'p1', createdAt: TODAY }]).success).toBe(false);
    expect(tasksFileSchema.safeParse([{ id: 't1', projectId: 'p1' }]).success).toBe(false);
    expect(projectsFileSchema.safeParse([{ id: '', createdAt: TODAY }]).success).toBe(false);
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
