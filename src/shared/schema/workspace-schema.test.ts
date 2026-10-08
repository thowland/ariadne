import { describe, expect, it } from 'vitest';

import { seedWorkspace } from '../domain/seed';
import { DEFAULT_SETTINGS } from '../types';

import {
  contactSchema,
  filesFileSchema,
  normalizeWorkspace,
  projectsFileSchema,
  projectSchema,
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
      structuredClone(ws.contacts),
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
      structuredClone(ws.contacts),
      { ...ws.settings },
    );
    expect(workspace.tasks.find((x) => x.id === 't2')?.dependsOn).toEqual(['t1']);
  });

  it('drops sidebar dividers whose project is gone (D42)', () => {
    const { workspace } = normalizeWorkspace(
      structuredClone(ws.projects),
      structuredClone(ws.tasks),
      structuredClone(ws.files),
      structuredClone(ws.contacts),
      { ...ws.settings, sidebarDividers: ['p3', 'ghost'] },
    );
    expect(workspace.settings.sidebarDividers).toEqual(['p3']);
  });

  it('drops group names and folds whose divider is gone (D50)', () => {
    const { workspace } = normalizeWorkspace(
      structuredClone(ws.projects),
      structuredClone(ws.tasks),
      structuredClone(ws.files),
      structuredClone(ws.contacts),
      {
        ...ws.settings,
        sidebarDividers: ['p3'],
        sidebarGroupNames: { p3: 'Home', p4: 'Stale' },
        sidebarCollapsed: ['p3', 'p4'],
      },
    );
    expect(workspace.settings.sidebarGroupNames).toEqual({ p3: 'Home' });
    expect(workspace.settings.sidebarCollapsed).toEqual(['p3']);
  });

  it('leaves an intact divider list untouched', () => {
    const settings = {
      ...ws.settings,
      sidebarDividers: ['p2'],
      sidebarGroupNames: { p2: 'Work' },
      sidebarCollapsed: ['p2'],
    };
    const { workspace } = normalizeWorkspace(
      structuredClone(ws.projects),
      structuredClone(ws.tasks),
      structuredClone(ws.files),
      structuredClone(ws.contacts),
      settings,
    );
    expect(workspace.settings).toBe(settings);
  });

  it('nulls dangling file→task links', () => {
    const files = structuredClone(ws.files);
    files[0]!.taskId = 'ghost-task';
    const { workspace } = normalizeWorkspace(
      structuredClone(ws.projects),
      structuredClone(ws.tasks),
      files,
      structuredClone(ws.contacts),
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
      structuredClone(ws.contacts),
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
    expect(settingsSchema.parse({ sidebarDividers: 'p1' }).sidebarDividers).toEqual([]);
    expect(settingsSchema.parse({ sidebarDividers: ['p1'] }).sidebarDividers).toEqual(['p1']);
    // Group names and fold state (D50) load silently from older files.
    expect(settingsSchema.parse({}).sidebarGroupNames).toEqual({});
    expect(settingsSchema.parse({}).sidebarCollapsed).toEqual([]);
    expect(settingsSchema.parse({ sidebarGroupNames: ['x'] }).sidebarGroupNames).toEqual({});
    expect(settingsSchema.parse({ sidebarGroupNames: { p1: 'Home' } }).sidebarGroupNames).toEqual({
      p1: 'Home',
    });
    expect(settingsSchema.parse({ badgeMode: 'flashing' }).badgeMode).toBe('none');
  });

  it('keeps a valid value', () => {
    expect(settingsSchema.parse({ badgeMode: 'overdue' }).badgeMode).toBe('overdue');
    expect(settingsSchema.parse({ badgeMode: 'due' }).badgeMode).toBe('due');
  });
});

describe('hideCompleted (D30)', () => {
  it('is absent on a project saved before the field existed', () => {
    const parsed = projectSchema.parse({
      id: 'p1',
      name: 'X',
      category: 'work',
      tags: [],
      color: '#4f5bd5',
      status: 'Active',
      notes: '',
      links: [],
      createdAt: '2026-07-01',
    });
    // Absent, not false — pre-1.21 documents must round-trip byte-identical.
    expect('hideCompleted' in parsed).toBe(false);
  });

  it('keeps a real value and falls back for a bad one', () => {
    const base = {
      id: 'p1',
      name: 'X',
      category: 'work' as const,
      tags: [],
      color: '#4f5bd5',
      status: 'Active',
      notes: '',
      links: [],
      createdAt: '2026-07-01',
    };
    expect(projectSchema.parse({ ...base, hideCompleted: true }).hideCompleted).toBe(true);
    expect(projectSchema.parse({ ...base, hideCompleted: 'yes' }).hideCompleted).toBe(false);
  });
});

describe('contactSchema (D31)', () => {
  it('defaults every field but the id, so a half-filled person still loads', () => {
    const parsed = contactSchema.safeParse({ id: 'c1', createdAt: '2026-07-08', phone: 42 });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toEqual({
      id: 'c1',
      firstName: '',
      lastName: '',
      company: '',
      department: '',
      role: '',
      email: '',
      phone: '',
      notes: '',
      tags: [],
      createdAt: '2026-07-08',
    });
  });

  it('still insists on an id and a real date', () => {
    expect(contactSchema.safeParse({ id: '', createdAt: '2026-07-08' }).success).toBe(false);
  });

  it('keeps a picked avatar colour and drops a malformed one (D44)', () => {
    const base = { id: 'c1', createdAt: '2026-07-08' };
    expect(contactSchema.parse({ ...base, color: '#a1b2c3' }).color).toBe('#a1b2c3');
    expect(contactSchema.parse({ ...base, color: 'teal' }).color).toBeUndefined();
    expect(contactSchema.parse(base).color).toBeUndefined();
    expect(contactSchema.safeParse({ id: 'c1', createdAt: '2026-02-30' }).success).toBe(false);
  });
});

describe('contact manager links (D32)', () => {
  const ws = seedWorkspace(TODAY);

  it('keeps a manager id through the schema, and defaults department', () => {
    const parsed = contactSchema.safeParse({
      id: 'c1',
      createdAt: TODAY,
      managerId: 'c8',
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.managerId).toBe('c8');
    // A 2.0 contact has no department key at all; it must still load.
    expect(parsed.data.department).toBe('');
  });

  it('round-trips a hand-placed org-map layout, and drops a broken one', () => {
    const good = contactSchema.safeParse({
      id: 'c1',
      createdAt: TODAY,
      orgLayout: { c8: { x: 480, y: 12 } },
      orgMapHeight: 320,
    });
    expect(good.success).toBe(true);
    if (!good.success) return;
    expect(good.data.orgLayout).toEqual({ c8: { x: 480, y: 12 } });
    expect(good.data.orgMapHeight).toBe(320);

    // A non-finite coordinate would place a node nowhere at all.
    const bad = contactSchema.safeParse({
      id: 'c1',
      createdAt: TODAY,
      orgLayout: { c8: { x: 'over there', y: 12 } },
      orgMapHeight: Infinity,
    });
    expect(bad.success).toBe(true);
    if (!bad.success) return;
    expect(bad.data.orgLayout).toBeUndefined();
    expect(bad.data.orgMapHeight).toBeUndefined();
  });

  it('drops a manager id that is not a string rather than failing the contact', () => {
    const parsed = contactSchema.safeParse({ id: 'c1', createdAt: TODAY, managerId: 7 });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.managerId).toBeUndefined();
  });

  it('clears a manager who was deleted, and anybody made their own manager', () => {
    const contacts = structuredClone(ws.contacts);
    const first = contacts[0];
    const second = contacts[1];
    if (first === undefined || second === undefined) throw new Error('fixture drift');
    first.managerId = 'ghost';
    second.managerId = second.id;

    const { workspace, warnings } = normalizeWorkspace(
      structuredClone(ws.projects),
      structuredClone(ws.tasks),
      structuredClone(ws.files),
      contacts,
      { ...ws.settings },
    );
    expect(workspace.contacts[0]?.managerId).toBeUndefined();
    expect(workspace.contacts[1]?.managerId).toBeUndefined();
    expect(warnings.some((w) => w.includes('manager link'))).toBe(true);
  });

  it('leaves a good reporting line alone', () => {
    const { workspace, warnings } = normalizeWorkspace(
      structuredClone(ws.projects),
      structuredClone(ws.tasks),
      structuredClone(ws.files),
      structuredClone(ws.contacts),
      { ...ws.settings },
    );
    expect(workspace.contacts.find((c) => c.id === 'c2')?.managerId).toBe('c8');
    expect(warnings).toEqual([]);
  });
});

describe('normalizeWorkspace — contact links (D31)', () => {
  const ws = seedWorkspace(TODAY);

  it('scrubs ids pointing at contacts that are no longer there', () => {
    const tasks = structuredClone(ws.tasks);
    const t = tasks.find((x) => x.id === 't1');
    if (t === undefined) throw new Error('fixture drift');
    t.contactIds = ['c1', 'ghost'];
    const projects = structuredClone(ws.projects);
    const p = projects[0];
    if (p === undefined) throw new Error('fixture drift');
    p.contactIds = ['gone'];

    const { workspace, warnings } = normalizeWorkspace(
      projects,
      tasks,
      structuredClone(ws.files),
      structuredClone(ws.contacts),
      { ...ws.settings },
    );
    expect(workspace.tasks.find((x) => x.id === 't1')?.contactIds).toEqual(['c1']);
    expect(workspace.projects[0]?.contactIds).toEqual([]);
    expect(warnings.some((w) => w.includes('contact reference'))).toBe(true);
  });

  it('leaves a task with no contact list alone rather than materializing one', () => {
    const { workspace } = normalizeWorkspace(
      structuredClone(ws.projects),
      structuredClone(ws.tasks),
      structuredClone(ws.files),
      structuredClone(ws.contacts),
      { ...ws.settings },
    );
    const untouched = workspace.tasks.find((t) => t.id === 't5' || t.contactIds === undefined);
    expect(untouched?.contactIds).toBeUndefined();
  });
});
