import { describe, expect, it } from 'vitest';

import type { FileEntry, Project, Task, Workspace } from '../types';
import { DEFAULT_SETTINGS, PROJECT_PALETTE } from '../types';

import { planContactImport } from './contact-csv';
import type { MutationCtx } from './mutate';
import {
  addContactToProject,
  addContactToTask,
  addDependency,
  applyContactImport,
  clearAll,
  createContact,
  createMarkdownFile,
  createProject,
  createTask,
  cycleTaskStatus,
  deleteContact,
  deleteFile,
  deleteProject,
  deleteTask,
  moveProject,
  moveSidebarDivider,
  moveTasksToProject,
  registerUploadedFile,
  removeContactFromProject,
  removeDependency,
  removeSidebarDivider,
  renameSidebarGroup,
  rescheduleTasks,
  replaceWorkspace,
  setContactManager,
  setTaskContacts,
  toggleSidebarGroup,
  updateContact,
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
    contacts: [],
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

  it('records a deferral when an open task’s due date is pushed later (D23)', () => {
    const w = ws({ tasks: [task({ dueDate: '2026-07-10' })] });
    const first = updateTask(w, 't1', { dueDate: '2026-07-15' }, ctx());
    expect(first.workspace.tasks[0]?.deferrals).toEqual([
      { from: '2026-07-10', to: '2026-07-15', on: TODAY },
    ]);

    // A push-out on a later day appends, oldest first.
    const later = { ...ctx(), today: '2026-07-09' };
    const second = updateTask(first.workspace, 't1', { dueDate: '2026-07-20' }, later);
    expect(second.workspace.tasks[0]?.deferrals).toHaveLength(2);
    expect(second.workspace.tasks[0]?.deferrals?.[1]).toEqual({
      from: '2026-07-15',
      to: '2026-07-20',
      on: '2026-07-09',
    });
  });

  it('folds further pushes on the same day into that day’s record (D43)', () => {
    // Stepping a date field a month at a time is one decision, not three.
    let w = ws({ tasks: [task({ dueDate: '2026-07-10' })] });
    for (const due of ['2026-08-10', '2026-09-10', '2026-10-10']) {
      w = updateTask(w, 't1', { dueDate: due }, ctx()).workspace;
    }
    expect(w.tasks[0]?.deferrals).toEqual([{ from: '2026-07-10', to: '2026-10-10', on: TODAY }]);

    // Stepping back part of the way amends it again rather than vanishing.
    w = updateTask(w, 't1', { dueDate: '2026-08-10' }, ctx()).workspace;
    expect(w.tasks[0]?.deferrals).toEqual([{ from: '2026-07-10', to: '2026-08-10', on: TODAY }]);
  });

  it('forgets a same-day push that is taken back or cleared (D43)', () => {
    const earlier = { from: '2026-06-01', to: '2026-07-10', on: '2026-05-30' };
    const w = ws({ tasks: [task({ dueDate: '2026-07-10', deferrals: [earlier] })] });
    const pushed = updateTask(w, 't1', { dueDate: '2026-07-20' }, ctx()).workspace;
    expect(pushed.tasks[0]?.deferrals).toHaveLength(2);

    const back = updateTask(pushed, 't1', { dueDate: '2026-07-10' }, ctx()).workspace;
    expect(back.tasks[0]?.deferrals).toEqual([earlier]);
    const cleared = updateTask(pushed, 't1', { dueDate: null }, ctx()).workspace;
    expect(cleared.tasks[0]?.deferrals).toEqual([earlier]);
  });

  it('leaves an older record alone once the date has moved on from it', () => {
    // The last push was today, but the date has since been set elsewhere by a
    // path that recorded nothing — the record no longer describes this edit.
    const w = ws({
      tasks: [
        task({
          dueDate: '2026-07-05',
          deferrals: [{ from: '2026-07-01', to: '2026-07-10', on: TODAY }],
        }),
      ],
    });
    const r = updateTask(w, 't1', { dueDate: '2026-07-06' }, ctx());
    expect(r.workspace.tasks[0]?.deferrals).toHaveLength(2);
  });

  it('does not count pull-ins, first due dates, unchanged dates, or clearing', () => {
    const dated = ws({ tasks: [task({ dueDate: '2026-07-10' })] });
    expect(
      updateTask(dated, 't1', { dueDate: '2026-07-05' }, ctx()).workspace.tasks[0]?.deferrals,
    ).toBeUndefined();
    expect(
      updateTask(dated, 't1', { dueDate: '2026-07-10' }, ctx()).workspace.tasks[0]?.deferrals,
    ).toBeUndefined();
    expect(
      updateTask(dated, 't1', { dueDate: null }, ctx()).workspace.tasks[0]?.deferrals,
    ).toBeUndefined();

    const undated = ws({ tasks: [task({ dueDate: null })] });
    expect(
      updateTask(undated, 't1', { dueDate: '2026-07-10' }, ctx()).workspace.tasks[0]?.deferrals,
    ).toBeUndefined();
  });

  it('does not count rescheduling closed tasks', () => {
    for (const status of ['Done', 'Dropped'] as const) {
      const w = ws({
        tasks: [
          task({
            status,
            dueDate: '2026-07-10',
            completedAt: status === 'Done' ? '2026-07-01' : null,
          }),
        ],
      });
      const r = updateTask(w, 't1', { dueDate: '2026-07-20' }, ctx());
      expect(r.workspace.tasks[0]?.deferrals).toBeUndefined();
    }
  });

  it('keeps existing deferrals when other fields change', () => {
    const w = ws({
      tasks: [task({ dueDate: '2026-07-10', deferrals: [{ from: 'x', to: 'y', on: 'z' }] })],
    });
    const r = updateTask(w, 't1', { title: 'Renamed' }, ctx());
    expect(r.workspace.tasks[0]?.deferrals).toHaveLength(1);
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

describe('contacts (D31)', () => {
  const withPeople = (): Workspace =>
    ws({
      tasks: [task({ id: 't1', contactIds: ['c1', 'c2'] }), task({ id: 't2' })],
      contacts: [
        {
          id: 'c1',
          firstName: 'Dana',
          lastName: 'Reyes',
          company: 'Northwind',
          department: '',
          role: 'Lead',
          email: 'dana@example.com',
          phone: '555',
          notes: '',
          tags: [],
          createdAt: TODAY,
        },
        {
          id: 'c2',
          firstName: 'Marcus',
          lastName: 'Bell',
          company: '',
          department: '',
          role: '',
          email: '',
          phone: '',
          notes: '',
          tags: [],
          createdAt: TODAY,
        },
      ],
    });

  it('createContact fills every field with a blank default', () => {
    const r = createContact(ws(), ctx(), { firstName: 'Dana' });
    expect(r.changed).toEqual(['contacts']);
    expect(r.workspace.contacts[0]).toEqual({
      id: 'id1',
      firstName: 'Dana',
      lastName: '',
      company: '',
      department: '',
      role: '',
      email: '',
      phone: '',
      notes: '',
      tags: [],
      createdAt: TODAY,
    });
  });

  it('updateContact merges, and ignores an unknown id', () => {
    const w = withPeople();
    expect(updateContact(w, 'c1', { phone: '999' }).workspace.contacts[0]?.phone).toBe('999');
    expect(updateContact(w, 'ghost', { phone: '999' }).changed).toEqual([]);
  });

  it('deleteContact scrubs every link but destroys no task or project', () => {
    const w = addContactToProject(withPeople(), 'p1', 'c1').workspace;
    const r = deleteContact(w, 'c1');
    expect(r.changed).toEqual(['projects', 'tasks', 'contacts']);
    expect(r.workspace.contacts.map((c) => c.id)).toEqual(['c2']);
    expect(r.workspace.tasks).toHaveLength(2);
    expect(r.workspace.tasks[0]?.contactIds).toEqual(['c2']);
    expect(r.workspace.projects[0]?.contactIds).toEqual([]);
  });

  it('deleteContact touches only the contacts document when nothing links to them', () => {
    const r = deleteContact(withPeople(), 'c2');
    // c2 is on t1, so removing them does change tasks — use a truly unlinked
    // person to check the narrow case.
    expect(r.changed).toContain('tasks');
    const lonely = createContact(withPeople(), ctx(), {});
    expect(deleteContact(lonely.workspace, lonely.id).changed).toEqual(['contacts']);
    expect(deleteContact(withPeople(), 'ghost').changed).toEqual([]);
  });

  it('setTaskContacts de-duplicates, drops unknown ids, and no-ops on no change', () => {
    const w = withPeople();
    expect(setTaskContacts(w, 't2', ['c1', 'c1', 'ghost']).workspace.tasks[1]?.contactIds).toEqual([
      'c1',
    ]);
    expect(setTaskContacts(w, 't1', ['c1', 'c2']).changed).toEqual([]);
    expect(setTaskContacts(w, 'ghost', ['c1']).changed).toEqual([]);
  });

  it('addContactToTask is idempotent', () => {
    const w = withPeople();
    expect(addContactToTask(w, 't2', 'c1').workspace.tasks[1]?.contactIds).toEqual(['c1']);
    expect(addContactToTask(w, 't1', 'c1').changed).toEqual([]);
    expect(addContactToTask(w, 'ghost', 'c1').changed).toEqual([]);
  });

  it('attaches and detaches a project stakeholder without touching their tasks', () => {
    const w = addContactToProject(withPeople(), 'p1', 'c1').workspace;
    expect(w.projects[0]?.contactIds).toEqual(['c1']);
    // Already attached, unknown project, unknown contact: all no-ops.
    expect(addContactToProject(w, 'p1', 'c1').changed).toEqual([]);
    expect(addContactToProject(w, 'ghost', 'c1').changed).toEqual([]);
    expect(addContactToProject(w, 'p1', 'ghost').changed).toEqual([]);

    const off = removeContactFromProject(w, 'p1', 'c1');
    expect(off.changed).toEqual(['projects']);
    expect(off.workspace.projects[0]?.contactIds).toEqual([]);
    // Their task links survive — they are still on the card, via the task.
    expect(off.workspace.tasks[0]?.contactIds).toEqual(['c1', 'c2']);
    expect(removeContactFromProject(off.workspace, 'p1', 'c1').changed).toEqual([]);
  });
});

describe('dependencies from the map (D37)', () => {
  const chain = (): Workspace =>
    ws({
      tasks: [task({ id: 't1' }), task({ id: 't2', dependsOn: ['t1'] }), task({ id: 't3' })],
    });

  it('links a task to the one it was dropped on', () => {
    const r = addDependency(chain(), 't3', 't1');
    expect(r.linked).toBe(true);
    expect(r.changed).toEqual(['tasks']);
    expect(r.workspace.tasks.find((t) => t.id === 't3')?.dependsOn).toEqual(['t1']);
  });

  it('pins the dependent under its predecessor in the same edit', () => {
    const r = addDependency(chain(), 't3', 't1', { x: 40, y: 210 });
    // One user action, one save: the link and the placement travel together.
    expect(r.changed).toEqual(['projects', 'tasks']);
    expect(r.workspace.projects[0]?.depLayout).toEqual({ t3: { x: 40, y: 210 } });
  });

  it('rounds the pinned position, like a hand drag does', () => {
    const r = addDependency(chain(), 't3', 't1', { x: 40.6, y: 209.2 });
    expect(r.workspace.projects[0]?.depLayout?.t3).toEqual({ x: 41, y: 209 });
  });

  it('refuses a duplicate, a self-link, and a link that would close a loop', () => {
    expect(addDependency(chain(), 't2', 't1')).toMatchObject({ linked: false, reason: 'exists' });
    expect(addDependency(chain(), 't1', 't1')).toMatchObject({ linked: false, reason: 'cycle' });
    // t2 already waits on t1, so t1 waiting on t2 closes the ring.
    expect(addDependency(chain(), 't1', 't2')).toMatchObject({ linked: false, reason: 'cycle' });
  });

  it('refuses a task that is gone or in another project', () => {
    const w = ws({
      projects: [project(), project({ id: 'p2' })],
      tasks: [task({ id: 't1' }), task({ id: 'x', projectId: 'p2' })],
    });
    expect(addDependency(w, 't1', 'ghost')).toMatchObject({ linked: false, reason: 'invalid' });
    // Dependencies are same-project everywhere else in the app.
    expect(addDependency(w, 't1', 'x')).toMatchObject({ linked: false, reason: 'invalid' });
  });

  it('a refusal changes nothing at all', () => {
    const w = chain();
    const r = addDependency(w, 't1', 't2', { x: 10, y: 10 });
    expect(r.workspace).toBe(w);
    expect(r.changed).toEqual([]);
  });

  it('removeDependency drops one link and leaves the rest', () => {
    const w = addDependency(chain(), 't2', 't3').workspace;
    const r = removeDependency(w, 't2', 't1');
    expect(r.changed).toEqual(['tasks']);
    expect(r.workspace.tasks.find((t) => t.id === 't2')?.dependsOn).toEqual(['t3']);
    // A link that is not there is a no-op, not an error.
    expect(removeDependency(r.workspace, 't2', 't1').changed).toEqual([]);
    expect(removeDependency(r.workspace, 'ghost', 't1').changed).toEqual([]);
  });
});

describe('contacts — reporting lines and CSV import (D32/D33)', () => {
  const people = (): Workspace =>
    ws({
      contacts: [
        {
          id: 'c1',
          firstName: 'Dana',
          lastName: 'Reyes',
          company: 'Northwind',
          department: '',
          role: '',
          email: '',
          phone: '',
          notes: '',
          tags: [],
          createdAt: TODAY,
        },
        {
          id: 'c2',
          firstName: 'Ines',
          lastName: 'Barros',
          company: 'Northwind',
          department: '',
          role: '',
          email: '',
          phone: '',
          notes: '',
          tags: [],
          createdAt: TODAY,
        },
        {
          id: 'c3',
          firstName: 'Kwame',
          lastName: 'Mensah',
          company: 'Northwind',
          department: '',
          role: '',
          email: '',
          phone: '',
          notes: '',
          tags: [],
          createdAt: TODAY,
        },
      ],
    });

  it('sets and clears a manager', () => {
    const linked = setContactManager(people(), 'c2', 'c1');
    expect(linked.changed).toEqual(['contacts']);
    expect(linked.workspace.contacts[1]?.managerId).toBe('c1');
    const cleared = setContactManager(linked.workspace, 'c2', null);
    expect(cleared.workspace.contacts[1]).not.toHaveProperty('managerId');
  });

  it('refuses a self-link, an unknown id, and a no-op', () => {
    const w = people();
    expect(setContactManager(w, 'c1', 'c1').changed).toEqual([]);
    expect(setContactManager(w, 'c1', 'ghost').changed).toEqual([]);
    expect(setContactManager(w, 'ghost', 'c1').changed).toEqual([]);
    expect(setContactManager(w, 'c1', null).changed).toEqual([]);
  });

  it('refuses a link that would close a reporting loop', () => {
    // c3 → c2 → c1; making c1 report to c3 would close the ring.
    let w = setContactManager(people(), 'c2', 'c1').workspace;
    w = setContactManager(w, 'c3', 'c2').workspace;
    expect(setContactManager(w, 'c1', 'c3').changed).toEqual([]);
    expect(setContactManager(w, 'c1', 'c2').changed).toEqual([]);
  });

  it('applyContactImport creates, updates, and links managers by name', () => {
    const plan = planContactImport(
      [
        'First Name,Last Name,Company,Department,Manager',
        'Dana,Reyes,Northwind,Platform,',
        'Otto,Lindqvist,Northwind,Security,Dana Reyes',
      ].join('\n'),
      people().contacts,
    );
    if (!plan.ok) throw new Error(plan.error);

    const r = applyContactImport(people(), ctx(), plan.plan);
    expect(r.changed).toEqual(['contacts']);
    expect(r).toMatchObject({ created: 1, updated: 1, linked: 1 });
    // The existing Dana was updated in place, keeping her id.
    expect(r.workspace.contacts.find((c) => c.id === 'c1')?.department).toBe('Platform');
    const otto = r.workspace.contacts.find((c) => c.lastName === 'Lindqvist');
    expect(otto?.managerId).toBe('c1');
    expect(otto?.createdAt).toBe(TODAY);
  });

  it('leaves an unresolvable manager unset rather than inventing a contact', () => {
    const plan = planContactImport(
      'First Name,Last Name,Manager\nOtto,Lindqvist,Someone Missing',
      [],
    );
    if (!plan.ok) throw new Error(plan.error);
    const r = applyContactImport(ws(), ctx(), plan.plan);
    expect(r.created).toBe(1);
    expect(r.linked).toBe(0);
    expect(r.workspace.contacts).toHaveLength(1);
    expect(r.workspace.contacts[0]?.managerId).toBeUndefined();
  });

  it('breaks a reporting loop that arrives in the file', () => {
    // Two people who manage each other: importable rows, impossible chart.
    const plan = planContactImport(
      ['First Name,Last Name,Manager', 'Ada,One,Bob Two', 'Bob,Two,Ada One'].join('\n'),
      [],
    );
    if (!plan.ok) throw new Error(plan.error);
    const r = applyContactImport(ws(), ctx(), plan.plan);
    expect(r.created).toBe(2);
    // One link survives; the one that would close the ring is dropped.
    expect(r.linked).toBe(1);
    const withManager = r.workspace.contacts.filter((c) => c.managerId !== undefined);
    expect(withManager).toHaveLength(1);
  });

  it('is a no-op for an empty plan', () => {
    const r = applyContactImport(ws(), ctx(), {
      creates: [],
      updates: [],
      skipped: [],
      unresolvedManagers: [],
      rowsRead: 0,
    });
    expect(r.changed).toEqual([]);
  });
});

describe('settings & whole-workspace', () => {
  it('updateSettings merges', () => {
    const r = updateSettings(ws(), { todoistToken: 'abc' });
    expect(r.workspace.settings).toEqual({ ...DEFAULT_SETTINGS, todoistToken: 'abc' });
    expect(r.changed).toEqual(['settings']);
  });

  it('replaceWorkspace marks everything changed and flags the wipe for the write guard', () => {
    const next = ws({ projects: [] });
    const r = replaceWorkspace(next);
    expect(r.workspace).toBe(next);
    expect(r.changed).toEqual(['projects', 'tasks', 'files', 'contacts', 'settings']);
    expect(r.replaceAll).toBe(true);
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
    expect(r.replaceAll).toBe(true);
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

describe('rescheduleTasks', () => {
  const base = ws({
    projects: [project()],
    tasks: [
      task({ id: 'a', dueDate: '2026-07-01' }),
      task({ id: 'b', dueDate: '2026-07-02' }),
      task({ id: 'c', dueDate: TODAY }),
      task({ id: 'd', dueDate: null }),
    ],
  });

  it('sets the due date on every named task and counts the moves', () => {
    const r = rescheduleTasks(base, ['a', 'b'], TODAY);
    expect(r.changed).toEqual(['tasks']);
    expect(r.count).toBe(2);
    expect(r.workspace.tasks.map((t) => t.dueDate)).toEqual([TODAY, TODAY, TODAY, null]);
  });

  it('skips tasks already on that date, and unknown ids', () => {
    const r = rescheduleTasks(base, ['c', 'ghost'], TODAY);
    expect(r.count).toBe(0);
    expect(r.changed).toEqual([]);
    expect(r.workspace).toBe(base); // untouched, so no save is queued
  });

  it('can clear a due date', () => {
    const r = rescheduleTasks(base, ['a'], null);
    expect(r.count).toBe(1);
    expect(r.workspace.tasks.find((t) => t.id === 'a')?.dueDate).toBeNull();
  });

  it('leaves every other field alone, including completedAt', () => {
    const done = ws({
      tasks: [task({ id: 'a', status: 'Done', completedAt: '2026-07-01', dueDate: '2026-06-30' })],
    });
    const moved = rescheduleTasks(done, ['a'], TODAY).workspace.tasks[0];
    expect(moved).toMatchObject({ status: 'Done', completedAt: '2026-07-01', dueDate: TODAY });
  });
});

describe('moveTasksToProject', () => {
  const two = [project(), project({ id: 'p2', name: 'Other' })];

  it('moves the named tasks and counts them', () => {
    const before = ws({
      projects: two,
      tasks: [task({ id: 'a' }), task({ id: 'b' }), task({ id: 'c' })],
    });
    const r = moveTasksToProject(before, ['a', 'b'], 'p2');
    expect(r.changed).toEqual(['tasks']);
    expect(r.count).toBe(2);
    expect(r.workspace.tasks.map((t) => t.projectId)).toEqual(['p2', 'p2', 'p1']);
  });

  it('keeps dependencies whose other end travels too (whole-project move)', () => {
    const before = ws({
      projects: two,
      tasks: [task({ id: 'a' }), task({ id: 'b', dependsOn: ['a'] })],
    });
    const r = moveTasksToProject(before, ['a', 'b'], 'p2');
    expect(r.count).toBe(2);
    expect(r.workspace.tasks.find((t) => t.id === 'b')?.dependsOn).toEqual(['a']);
  });

  it('scrubs dependencies in both directions when only one end moves', () => {
    const before = ws({
      projects: two,
      tasks: [
        task({ id: 'a' }),
        task({ id: 'b', dependsOn: ['a'] }),
        task({ id: 'c', dependsOn: ['b'] }),
      ],
    });
    const r = moveTasksToProject(before, ['b'], 'p2');
    // b leaves its blocker behind…
    expect(r.workspace.tasks.find((t) => t.id === 'b')?.dependsOn).toEqual([]);
    // …and c can no longer be blocked by a task in another project.
    expect(r.workspace.tasks.find((t) => t.id === 'c')?.dependsOn).toEqual([]);
  });

  it('re-homes files attached to a moved task', () => {
    const before = ws({
      projects: two,
      tasks: [task({ id: 'a' })],
      files: [file({ id: 'f1', taskId: 'a' }), file({ id: 'f2', taskId: null })],
    });
    const r = moveTasksToProject(before, ['a'], 'p2');
    expect(r.changed).toEqual(['tasks', 'files']);
    expect(r.workspace.files.map((f) => f.projectId)).toEqual(['p2', 'p1']);
  });

  it('is a no-op for an unknown target, unknown ids, or tasks already there', () => {
    const before = ws({ projects: two, tasks: [task({ id: 'a', projectId: 'p2' })] });
    expect(moveTasksToProject(before, ['a'], 'ghost').changed).toEqual([]);
    expect(moveTasksToProject(before, ['nope'], 'p2').changed).toEqual([]);
    const same = moveTasksToProject(before, ['a'], 'p2');
    expect(same.count).toBe(0);
    expect(same.workspace).toBe(before);
  });
});

describe('sidebar dividers (D42)', () => {
  const three = ws({
    projects: [project({ id: 'a' }), project({ id: 'b' }), project({ id: 'c' })],
  });

  it('creates a divider above the project it is dropped on', () => {
    const r = moveSidebarDivider(three, null, 'b');
    expect(r.changed).toEqual(['settings']);
    expect(r.workspace.settings.sidebarDividers).toEqual(['b']);
  });

  it('moves an existing divider rather than leaving two behind', () => {
    const withB = moveSidebarDivider(three, null, 'b').workspace;
    const r = moveSidebarDivider(withB, 'b', 'c');
    expect(r.workspace.settings.sidebarDividers).toEqual(['c']);
  });

  it('never stacks two dividers on the same project', () => {
    let w = moveSidebarDivider(three, null, 'b').workspace;
    w = moveSidebarDivider(w, null, 'c').workspace;
    // Dragging c's divider onto b's slot leaves one line, not two.
    const r = moveSidebarDivider(w, 'c', 'b');
    expect(r.workspace.settings.sidebarDividers).toEqual(['b']);
  });

  it('is a no-op for an unknown project, a self-drop, or a duplicate', () => {
    expect(moveSidebarDivider(three, null, 'nope').workspace).toBe(three);
    const withB = moveSidebarDivider(three, null, 'b').workspace;
    expect(moveSidebarDivider(withB, 'b', 'b').workspace).toBe(withB);
    expect(moveSidebarDivider(withB, null, 'b').workspace).toBe(withB);
  });

  it('removes a divider dropped outside the list', () => {
    const withB = moveSidebarDivider(three, null, 'b').workspace;
    const r = removeSidebarDivider(withB, 'b');
    expect(r.changed).toEqual(['settings']);
    expect(r.workspace.settings.sidebarDividers).toEqual([]);
    expect(removeSidebarDivider(r.workspace, 'b').workspace).toBe(r.workspace);
  });
});

describe('sidebar group names and folding (D50)', () => {
  const base = moveSidebarDivider(
    ws({ projects: [project({ id: 'a' }), project({ id: 'b' }), project({ id: 'c' })] }),
    null,
    'b',
  ).workspace;

  it('names a group, and a blank name goes back to the generic label', () => {
    const named = renameSidebarGroup(base, 'b', '  Home  ').workspace;
    expect(named.settings.sidebarGroupNames).toEqual({ b: 'Home' });
    expect(renameSidebarGroup(named, 'b', 'Home').workspace).toBe(named);
    expect(renameSidebarGroup(named, 'b', ' ').workspace.settings.sidebarGroupNames).toEqual({});
  });

  it('ignores a name or a fold for a divider that does not exist', () => {
    expect(renameSidebarGroup(base, 'c', 'Nope').workspace).toBe(base);
    expect(toggleSidebarGroup(base, 'c').workspace).toBe(base);
  });

  it('folds and unfolds a group', () => {
    const shut = toggleSidebarGroup(base, 'b').workspace;
    expect(shut.settings.sidebarCollapsed).toEqual(['b']);
    expect(toggleSidebarGroup(shut, 'b').workspace.settings.sidebarCollapsed).toEqual([]);
  });

  it('carries the name and fold state with a moved divider', () => {
    let w = renameSidebarGroup(base, 'b', 'Home').workspace;
    w = toggleSidebarGroup(w, 'b').workspace;
    const moved = moveSidebarDivider(w, 'b', 'c').workspace;
    expect(moved.settings.sidebarGroupNames).toEqual({ c: 'Home' });
    expect(moved.settings.sidebarCollapsed).toEqual(['c']);
  });

  it('moves an unnamed, open divider without inventing a name', () => {
    const moved = moveSidebarDivider(base, 'b', 'c').workspace;
    expect(moved.settings.sidebarGroupNames).toEqual({});
    expect(moved.settings.sidebarCollapsed).toEqual([]);
  });

  it('keeps the existing group name when a divider is dropped onto it', () => {
    let w = moveSidebarDivider(base, null, 'c').workspace;
    w = renameSidebarGroup(w, 'b', 'Home').workspace;
    w = renameSidebarGroup(w, 'c', 'Work').workspace;
    w = toggleSidebarGroup(w, 'c').workspace;
    const merged = moveSidebarDivider(w, 'c', 'b').workspace;
    expect(merged.settings.sidebarDividers).toEqual(['b']);
    expect(merged.settings.sidebarGroupNames).toEqual({ b: 'Home' });
    expect(merged.settings.sidebarCollapsed).toEqual([]);
  });

  it('forgets the name and fold state of a removed divider', () => {
    let w = renameSidebarGroup(base, 'b', 'Home').workspace;
    w = toggleSidebarGroup(w, 'b').workspace;
    const gone = removeSidebarDivider(w, 'b').workspace;
    expect(gone.settings.sidebarGroupNames).toEqual({});
    expect(gone.settings.sidebarCollapsed).toEqual([]);
  });
});
