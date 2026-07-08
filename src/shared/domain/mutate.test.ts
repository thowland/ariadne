import { describe, expect, it } from 'vitest';

import type { FileEntry, Project, Task, Workspace } from '../types';
import { DEFAULT_SETTINGS, PROJECT_PALETTE } from '../types';

import type { MutationCtx } from './mutate';
import {
  clearAll,
  createMarkdownFile,
  createProject,
  createTask,
  cycleTaskStatus,
  deleteFile,
  deleteProject,
  deleteTask,
  moveProject,
  registerUploadedFile,
  replaceWorkspace,
  updateFile,
  updateProject,
  updateSettings,
  updateTask,
} from './mutate';

const TODAY = '2026-07-08';

function ctx(): MutationCtx {
  let n = 0;
  return {
    today: TODAY,
    newId: () => {
      n += 1;
      return `id${n}`;
    },
  };
}

function project(patch: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'Project',
    category: 'work',
    tags: [],
    color: '#4f5bd5',
    status: 'Active',
    notes: '',
    links: [],
    createdAt: '2026-06-01',
    ...patch,
  };
}

function task(patch: Partial<Task> = {}): Task {
  return {
    id: 't1',
    projectId: 'p1',
    title: 'Task',
    status: 'Todo',
    priority: 'Medium',
    tags: [],
    notes: '',
    dueDate: null,
    dependsOn: [],
    subtasks: [],
    links: [],
    createdAt: '2026-06-01',
    completedAt: null,
    ...patch,
  };
}

function file(patch: Partial<FileEntry> = {}): FileEntry {
  return {
    id: 'f1',
    projectId: 'p1',
    taskId: null,
    name: 'Doc.md',
    ext: 'md',
    mime: 'text/markdown',
    kind: 'markdown',
    size: 0,
    content: '# Doc',
    createdAt: '2026-06-01',
    ...patch,
  };
}

function ws(patch: Partial<Workspace> = {}): Workspace {
  return {
    projects: [project()],
    tasks: [],
    files: [],
    settings: { ...DEFAULT_SETTINGS },
    ...patch,
  };
}

describe('createProject', () => {
  it('creates with prototype defaults and palette round-robin', () => {
    const r = createProject(ws({ projects: [] }), ctx());
    expect(r.changed).toEqual(['projects']);
    const p = r.workspace.projects[0];
    expect(p).toMatchObject({
      id: 'id1',
      name: 'Untitled project',
      category: 'work',
      status: 'Active',
      color: PROJECT_PALETTE[0],
      createdAt: TODAY,
    });
  });

  it('cycles the palette by project count', () => {
    const seven = Array.from({ length: 7 }, (_, i) => project({ id: `p${i}` }));
    const r = createProject(ws({ projects: seven }), ctx());
    expect(r.workspace.projects[7]?.color).toBe(PROJECT_PALETTE[0]);
  });

  it('applies a patch', () => {
    const r = createProject(ws({ projects: [] }), ctx(), { name: 'Boat', category: 'home' });
    expect(r.workspace.projects[0]).toMatchObject({ name: 'Boat', category: 'home' });
  });
});

describe('updateProject', () => {
  it('patches fields', () => {
    const r = updateProject(ws(), 'p1', { name: 'Renamed', tags: ['x'] });
    expect(r.workspace.projects[0]).toMatchObject({ name: 'Renamed', tags: ['x'] });
    expect(r.changed).toEqual(['projects']);
  });

  it('is a no-op for unknown ids', () => {
    const w = ws();
    const r = updateProject(w, 'ghost', { name: 'X' });
    expect(r.changed).toEqual([]);
    expect(r.workspace).toBe(w);
  });
});

describe('deleteProject', () => {
  it('cascades tasks, files, cross-project dependency refs, and reports blob ids', () => {
    const w = ws({
      projects: [project(), project({ id: 'p2' })],
      tasks: [
        task({ id: 'a', projectId: 'p1' }),
        task({ id: 'b', projectId: 'p2', dependsOn: ['a'] }),
      ],
      files: [
        file({ id: 'fmd', projectId: 'p1', kind: 'markdown' }),
        file({ id: 'fbin', projectId: 'p1', kind: 'file', ext: 'pdf' }),
        file({ id: 'fkeep', projectId: 'p2' }),
      ],
    });
    const r = deleteProject(w, 'p1');
    expect(r.workspace.projects.map((p) => p.id)).toEqual(['p2']);
    expect(r.workspace.tasks.map((t) => t.id)).toEqual(['b']);
    expect(r.workspace.tasks[0]?.dependsOn).toEqual([]);
    expect(r.workspace.files.map((f) => f.id)).toEqual(['fkeep']);
    expect(r.removedBlobIds).toEqual(['fbin']);
    expect(r.changed).toEqual(['projects', 'tasks', 'files']);
  });

  it('is a no-op for unknown ids', () => {
    const r = deleteProject(ws(), 'ghost');
    expect(r.changed).toEqual([]);
    expect(r.removedBlobIds).toEqual([]);
  });
});

describe('createTask', () => {
  it('creates with prototype defaults', () => {
    const r = createTask(ws(), ctx(), 'p1', { title: 'New' });
    expect(r.workspace.tasks[0]).toMatchObject({
      id: 'id1',
      projectId: 'p1',
      title: 'New',
      status: 'Todo',
      priority: 'Medium',
      dueDate: null,
      completedAt: null,
      createdAt: TODAY,
    });
  });

  it('stamps completedAt when created directly as Done', () => {
    const r = createTask(ws(), ctx(), 'p1', { status: 'Done' });
    expect(r.workspace.tasks[0]?.completedAt).toBe(TODAY);
  });
});

describe('updateTask', () => {
  it('stamps completedAt on Done and clears it on reopen', () => {
    const w = ws({ tasks: [task()] });
    const done = updateTask(w, 't1', { status: 'Done' }, ctx());
    expect(done.workspace.tasks[0]?.completedAt).toBe(TODAY);

    const reopened = updateTask(done.workspace, 't1', { status: 'Doing' }, ctx());
    expect(reopened.workspace.tasks[0]?.completedAt).toBeNull();
  });

  it('does not restamp completedAt when already Done', () => {
    const w = ws({ tasks: [task({ status: 'Done', completedAt: '2026-07-01' })] });
    const r = updateTask(w, 't1', { status: 'Done' }, ctx());
    expect(r.workspace.tasks[0]?.completedAt).toBe('2026-07-01');
  });

  it('moving projects scrubs dependencies in both directions and re-homes files', () => {
    const w = ws({
      projects: [project(), project({ id: 'p2' })],
      tasks: [
        task({ id: 'dep', projectId: 'p1' }),
        task({ id: 'moving', projectId: 'p1', dependsOn: ['dep'] }),
        task({ id: 'dependent', projectId: 'p1', dependsOn: ['moving'] }),
      ],
      files: [file({ id: 'att', taskId: 'moving' }), file({ id: 'other' })],
    });
    const r = updateTask(w, 'moving', { projectId: 'p2' }, ctx());
    const moved = r.workspace.tasks.find((t) => t.id === 'moving');
    const dependent = r.workspace.tasks.find((t) => t.id === 'dependent');
    expect(moved?.projectId).toBe('p2');
    expect(moved?.dependsOn).toEqual([]);
    expect(dependent?.dependsOn).toEqual([]);
    expect(r.workspace.files.find((f) => f.id === 'att')?.projectId).toBe('p2');
    expect(r.workspace.files.find((f) => f.id === 'other')?.projectId).toBe('p1');
    expect(r.changed).toEqual(['tasks', 'files']);
  });

  it('is a no-op for unknown ids', () => {
    const w = ws();
    expect(updateTask(w, 'ghost', { title: 'X' }, ctx()).changed).toEqual([]);
  });
});

describe('deleteTask', () => {
  it('removes the task, scrubs dependsOn refs, detaches files', () => {
    const w = ws({
      tasks: [task({ id: 'a' }), task({ id: 'b', dependsOn: ['a'] })],
      files: [file({ id: 'att', taskId: 'a' })],
    });
    const r = deleteTask(w, 'a');
    expect(r.workspace.tasks.map((t) => t.id)).toEqual(['b']);
    expect(r.workspace.tasks[0]?.dependsOn).toEqual([]);
    expect(r.workspace.files[0]?.taskId).toBeNull();
    expect(r.changed).toEqual(['tasks', 'files']);
  });

  it('leaves files untouched when none are attached', () => {
    const r = deleteTask(ws({ tasks: [task()] }), 't1');
    expect(r.changed).toEqual(['tasks']);
  });
});

describe('cycleTaskStatus', () => {
  it.each([
    ['Todo', 'Doing'],
    ['Doing', 'Waiting'],
    ['Waiting', 'Done'],
    ['Done', 'Todo'],
    ['Dropped', 'Todo'],
  ] as const)('%s → %s', (from, to) => {
    const w = ws({
      tasks: [task({ status: from, completedAt: from === 'Done' ? '2026-07-01' : null })],
    });
    const r = cycleTaskStatus(w, 't1', ctx());
    expect(r.workspace.tasks[0]?.status).toBe(to);
  });

  it('stamps and clears completedAt through the cycle', () => {
    const w = ws({ tasks: [task({ status: 'Waiting' })] });
    const done = cycleTaskStatus(w, 't1', ctx());
    expect(done.workspace.tasks[0]?.completedAt).toBe(TODAY);
    const reopened = cycleTaskStatus(done.workspace, 't1', ctx());
    expect(reopened.workspace.tasks[0]?.completedAt).toBeNull();
  });
});

describe('files', () => {
  it('createMarkdownFile uses prototype defaults', () => {
    const r = createMarkdownFile(ws(), ctx(), 'p1', 'task9');
    expect(r.workspace.files[0]).toMatchObject({
      id: 'id1',
      projectId: 'p1',
      taskId: 'task9',
      name: 'Untitled.md',
      kind: 'markdown',
      content: '# Untitled\n\n',
    });
  });

  it('registerUploadedFile derives the extension', () => {
    const r = registerUploadedFile(ws(), ctx(), {
      projectId: 'p1',
      taskId: null,
      name: 'Report.Final.PDF',
      mime: 'application/pdf',
      size: 12345,
    });
    expect(r.workspace.files[0]).toMatchObject({ ext: 'pdf', kind: 'file', size: 12345 });
  });

  it('registerUploadedFile handles extensionless names', () => {
    const r = registerUploadedFile(ws(), ctx(), {
      projectId: 'p1',
      taskId: null,
      name: 'README',
      mime: '',
      size: 10,
    });
    expect(r.workspace.files[0]?.ext).toBe('');
  });

  it('updateFile patches and deleteFile reports blob removal for binaries only', () => {
    const w = ws({ files: [file(), file({ id: 'fbin', kind: 'file' })] });
    const updated = updateFile(w, 'f1', { name: 'Renamed.md' });
    expect(updated.workspace.files[0]?.name).toBe('Renamed.md');

    expect(deleteFile(w, 'f1').removedBlobIds).toEqual([]);
    expect(deleteFile(w, 'fbin').removedBlobIds).toEqual(['fbin']);
    expect(deleteFile(w, 'ghost').changed).toEqual([]);
  });
});

describe('settings & whole-workspace', () => {
  it('updateSettings merges', () => {
    const r = updateSettings(ws(), { todoistToken: 'abc' });
    expect(r.workspace.settings).toEqual({ ...DEFAULT_SETTINGS, todoistToken: 'abc' });
    expect(r.changed).toEqual(['settings']);
  });

  it('replaceWorkspace marks everything changed', () => {
    const next = ws({ projects: [] });
    const r = replaceWorkspace(next);
    expect(r.workspace).toBe(next);
    expect(r.changed).toEqual(['projects', 'tasks', 'files', 'settings']);
  });

  it('clearAll empties collections, keeps settings, reports blobs', () => {
    const w = ws({
      tasks: [task()],
      files: [file({ id: 'fbin', kind: 'file' })],
      settings: { ...DEFAULT_SETTINGS, todoistToken: 'keep' },
    });
    const r = clearAll(w);
    expect(r.workspace.projects).toEqual([]);
    expect(r.workspace.tasks).toEqual([]);
    expect(r.workspace.files).toEqual([]);
    expect(r.workspace.settings.todoistToken).toBe('keep');
    expect(r.removedBlobIds).toEqual(['fbin']);
  });
});

describe('structural sharing', () => {
  it('untouched collections keep their identity', () => {
    const w = ws({ tasks: [task()] });
    const r = updateTask(w, 't1', { title: 'New title' }, ctx());
    expect(r.workspace.projects).toBe(w.projects);
    expect(r.workspace.files).toBe(w.files);
    expect(r.workspace.settings).toBe(w.settings);
    expect(r.workspace.tasks).not.toBe(w.tasks);
  });
});

describe('moveProject', () => {
  const three = ws({
    projects: [project({ id: 'a' }), project({ id: 'b' }), project({ id: 'c' })],
  });

  it('moves a project to the target index (both directions)', () => {
    expect(moveProject(three, 'c', 0).workspace.projects.map((p) => p.id)).toEqual(['c', 'a', 'b']);
    expect(moveProject(three, 'a', 2).workspace.projects.map((p) => p.id)).toEqual(['b', 'c', 'a']);
    expect(moveProject(three, 'c', 0).changed).toEqual(['projects']);
  });

  it('clamps out-of-range targets', () => {
    expect(moveProject(three, 'a', 99).workspace.projects.map((p) => p.id)).toEqual([
      'b',
      'c',
      'a',
    ]);
    expect(moveProject(three, 'c', -5).workspace.projects.map((p) => p.id)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('is a no-op for same position or unknown ids', () => {
    expect(moveProject(three, 'b', 1).changed).toEqual([]);
    expect(moveProject(three, 'ghost', 0).changed).toEqual([]);
    expect(moveProject(three, 'b', 1).workspace).toBe(three);
  });
});
