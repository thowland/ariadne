import { describe, expect, it } from 'vitest';

import { splitTypedName } from './contacts';
import { updateProject } from './mutate';
import type { MutationCtx } from './mutate';
import {
  commitQuickAdd,
  defaultQuickAddProject,
  finishQuickAdd,
  quickAddContext,
} from './quick-add';
import type { QuickAddDraft } from './quick-add';
import { seedWorkspace } from './seed';

const TODAY = '2026-07-08';

function ctx(): MutationCtx {
  let n = 0;
  return {
    today: TODAY,
    newId: () => {
      n += 1;
      return `new-${String(n)}`;
    },
  };
}

function draft(fields: Partial<QuickAddDraft> = {}): QuickAddDraft {
  return {
    projectId: 'p1',
    title: 'Call the vendor',
    dueDate: null,
    tags: [],
    people: [],
    ...fields,
  };
}

describe('finishQuickAdd', () => {
  const opts = { today: TODAY, dismissed: false, tags: [] as string[] };

  it('takes a date phrase out of the title and keeps the date', () => {
    expect(finishQuickAdd('Call the vendor tomorrow', opts)).toEqual({
      title: 'Call the vendor',
      dueDate: '2026-07-09',
    });
  });

  it('leaves the phrase alone once the highlight was dismissed', () => {
    expect(finishQuickAdd('Call the vendor tomorrow', { ...opts, dismissed: true })).toEqual({
      title: 'Call the vendor tomorrow',
      dueDate: null,
    });
  });

  it('strips picked tags but not a # nobody picked', () => {
    expect(finishQuickAdd('Sand #woodworking #kayak', { ...opts, tags: ['woodworking'] })).toEqual({
      title: 'Sand #kayak',
      dueDate: null,
    });
  });

  it('does not read a colleague called Tom as tomorrow', () => {
    expect(finishQuickAdd('Ask @Tom Whitaker about it', opts)?.dueDate).toBeNull();
  });

  it('returns null when nothing is left to call the task', () => {
    expect(finishQuickAdd('  tomorrow ', opts)).toBeNull();
  });
});

describe('commitQuickAdd', () => {
  it('creates the task with its date, tags and people', () => {
    const ws = seedWorkspace(TODAY);
    const r = commitQuickAdd(
      ws,
      ctx(),
      draft({
        dueDate: '2026-07-10',
        tags: ['infra'],
        people: [{ contactId: 'c1', name: 'Dana' }],
      }),
    );
    expect(r.changed).toEqual(['tasks']);
    const task = r.workspace.tasks.find((t) => t.id === 'new-1');
    expect(task).toMatchObject({
      projectId: 'p1',
      title: 'Call the vendor',
      dueDate: '2026-07-10',
      tags: ['infra'],
      contactIds: ['c1'],
    });
  });

  it('creates a provisional person only now, and links them', () => {
    const ws = seedWorkspace(TODAY);
    const r = commitQuickAdd(
      ws,
      ctx(),
      draft({ people: [{ contactId: null, name: 'Nia Okafor' }] }),
    );
    expect(r.changed.sort()).toEqual(['contacts', 'tasks']);
    const person = r.workspace.contacts.find((c) => c.id === 'new-1');
    expect(person).toMatchObject(splitTypedName('Nia Okafor'));
    expect(r.workspace.tasks.find((t) => t.id === 'new-2')?.contactIds).toEqual(['new-1']);
  });

  it('drops a linked contact that no longer exists', () => {
    const r = commitQuickAdd(
      seedWorkspace(TODAY),
      ctx(),
      draft({ people: [{ contactId: 'ghost', name: 'Gone' }] }),
    );
    expect(r.workspace.tasks.find((t) => t.id === 'new-1')?.contactIds).toBeUndefined();
  });

  it('creates nothing for a missing or archived project, or a blank title', () => {
    const ws = seedWorkspace(TODAY);
    expect(commitQuickAdd(ws, ctx(), draft({ projectId: 'ghost' })).workspace).toBe(ws);
    expect(commitQuickAdd(ws, ctx(), draft({ title: '  ' })).workspace).toBe(ws);
    const archived = updateProject(ws, 'p1', { archived: true }).workspace;
    expect(commitQuickAdd(archived, ctx(), draft()).changed).toEqual([]);
  });
});

describe('quickAddContext / defaultQuickAddProject', () => {
  it('offers active projects in sidebar order, plus people, tags and theme', () => {
    const ws = updateProject(seedWorkspace(TODAY), 'p2', { archived: true }).workspace;
    const c = quickAddContext(ws);
    expect(c.projects.map((p) => p.id)).toEqual(
      ws.projects.filter((p) => p.id !== 'p2').map((p) => p.id),
    );
    expect(c.contacts).toBe(ws.contacts);
    expect(c.tags).toContain('woodworking');
    expect(c.theme).toBe('system');
  });

  it('opens on the last project used, falling back to the first', () => {
    const c = quickAddContext(seedWorkspace(TODAY));
    expect(defaultQuickAddProject(c, 'p3')).toBe('p3');
    expect(defaultQuickAddProject(c, 'ghost')).toBe('p1');
    expect(defaultQuickAddProject(c, null)).toBe('p1');
    expect(defaultQuickAddProject({ ...c, projects: [] }, null)).toBeNull();
  });
});
