import { describe, expect, it } from 'vitest';

import { importProject } from '../domain/mutate';
import type { MutationCtx } from '../domain/mutate';
import { seedWorkspace } from '../domain/seed';
import type { Workspace } from '../types';
import { PROJECT_PALETTE } from '../types';

import { buildExport, parseProjectImport } from './import-export';
import type { ProjectImport } from './import-export';

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

function plan(doc: unknown): ProjectImport {
  const parsed = parseProjectImport(JSON.stringify(doc), TODAY);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
}

function errorOf(text: string): string {
  const parsed = parseProjectImport(text, TODAY);
  return parsed.ok ? '' : parsed.error;
}

const SAMPLE = {
  project: {
    id: 'old-p',
    name: 'Kitchen remodel',
    category: 'home',
    tags: ['house'],
    color: '#123abc',
    notes: 'Budget 20k',
    archived: true,
    contactIds: ['ghost'],
    depLayout: { a: { x: 10, y: 20 }, missing: { x: 1, y: 1 } },
    createdAt: '2026-01-02',
  },
  tasks: [
    { id: 'a', title: 'Pick cabinets', status: 'Done', createdAt: '2026-01-03' },
    { id: 'b', title: 'Order cabinets', dependsOn: ['a', 'nope'], dueDate: '2026-08-01' },
  ],
  files: [
    { id: 'f1', name: 'Plan.md', kind: 'markdown', content: '# Plan', taskId: 'b' },
    { id: 'f2', name: 'photo.jpg', kind: 'file', size: 100 },
  ],
};

describe('parseProjectImport', () => {
  it('reads the { project, tasks, files } shape and fills what is missing', () => {
    const p = plan(SAMPLE);
    expect(p.project).toMatchObject({
      name: 'Kitchen remodel',
      category: 'home',
      color: '#123abc',
    });
    expect(p.tasks.map((t) => t.title)).toEqual(['Pick cabinets', 'Order cabinets']);
    // No createdAt on task b → today; status defaults apply.
    expect(p.tasks[1]).toMatchObject({ createdAt: TODAY, status: 'Todo', priority: 'Medium' });
    // Blob files cannot travel in JSON; markdown notes can.
    expect(p.files.map((f) => f.name)).toEqual(['Plan.md']);
    expect(p.warnings).toEqual(['1 uploaded file left out (JSON carries no file contents)']);
  });

  it('reads a bare project that carries its own tasks', () => {
    const p = plan({ name: 'Taxes', tasks: [{ title: 'W-2' }, { title: 'Receipts' }] });
    expect(p.project.name).toBe('Taxes');
    expect(p.project.color).toBeNull();
    expect(p.project.createdAt).toBe(TODAY);
    expect(p.tasks).toHaveLength(2);
    // Tasks without ids get distinct placeholders.
    expect(new Set(p.tasks.map((t) => t.id)).size).toBe(2);
  });

  it('reads a workspace export that holds exactly one project', () => {
    const ws = seedWorkspace(TODAY);
    const only = ws.projects[0]!;
    const one: Workspace = {
      ...ws,
      projects: [only],
      tasks: ws.tasks,
      files: ws.files.filter((f) => f.projectId === only.id),
    };
    const p = plan(buildExport(one, {}));
    expect(p.project.name).toBe(only.name);
    // Only that project's tasks, even though the export listed them all.
    expect(p.tasks).toHaveLength(ws.tasks.filter((t) => t.projectId === only.id).length);
  });

  it('refuses what it cannot find a single project in', () => {
    expect(errorOf('{nope')).toBe('Invalid JSON — import failed');
    expect(errorOf('[1, 2]')).toBe('Not an Ariadne project (no project found)');
    expect(errorOf('{"tasks": []}')).toBe('Not an Ariadne project (no project found)');
    expect(errorOf('{"projects": []}')).toBe('This file holds no project to import');
    expect(errorOf('{"projects": [1]}')).toBe('Not an Ariadne project (no project found)');
    expect(errorOf('{"projects": [{}, {}]}')).toMatch(
      /holds 2 projects .* Import file… in Settings/,
    );
  });

  it('skips unreadable tasks and notes with a warning instead of failing', () => {
    const p = plan({
      name: 'X',
      tasks: ['junk', { title: 'ok' }, { id: 'ok', title: 'has id' }, { title: 'bad', tags: 5 }],
      files: [7, { name: 'n', kind: 'ref', note: 3 }],
    });
    // tags: 5 is caught to []; only the string is unreadable.
    expect(p.tasks.map((t) => t.title)).toEqual(['ok', 'has id', 'bad']);
    expect(p.warnings).toEqual(['1 unreadable task skipped', '2 unreadable notes skipped']);
  });
});

describe('importProject (D52)', () => {
  it('adds the project beside the existing ones with fresh ids everywhere', () => {
    const ws = seedWorkspace(TODAY);
    const result = importProject(ws, ctx(), plan(SAMPLE));
    const next = result.workspace;
    expect(next.projects).toHaveLength(ws.projects.length + 1);
    expect(next.projects.slice(0, -1)).toEqual(ws.projects);
    expect(next.tasks.slice(0, ws.tasks.length)).toEqual(ws.tasks);
    expect(result.changed).toEqual(['projects', 'tasks', 'files']);

    const project = next.projects.at(-1)!;
    expect(project.id).toBe(result.id);
    expect(project).toMatchObject({ name: 'Kitchen remodel', archived: false, color: '#123abc' });
    // A person not in this workspace is dropped; so is the stale layout entry.
    expect(project.contactIds).toBeUndefined();

    const [a, b] = next.tasks.filter((t) => t.projectId === project.id);
    expect(a!.id).not.toBe('a');
    expect(a!.completedAt).toBe('2026-01-03');
    expect(b!.dependsOn).toEqual([a!.id]);
    expect(project.depLayout).toEqual({ [a!.id]: { x: 10, y: 20 } });

    const note = next.files.find((f) => f.projectId === project.id)!;
    expect(note).toMatchObject({ name: 'Plan.md', taskId: b!.id });
  });

  it('importing the same file twice gives two separate projects', () => {
    const ws = seedWorkspace(TODAY);
    const c = ctx();
    const once = importProject(ws, c, plan(SAMPLE));
    const twice = importProject(once.workspace, c, plan(SAMPLE));
    expect(twice.id).not.toBe(once.id);
    expect(twice.workspace.projects.filter((p) => p.name === 'Kitchen remodel')).toHaveLength(2);
  });

  it('keeps people who exist here, picks a palette colour, and refuses dependency loops', () => {
    const ws = seedWorkspace(TODAY);
    const known = ws.contacts[0]!.id;
    const result = importProject(
      ws,
      ctx(),
      plan({
        name: 'Loop',
        contactIds: [known, 'ghost'],
        tasks: [
          { id: 'x', dependsOn: ['y', 'x'], contactIds: ['ghost'] },
          { id: 'y', dependsOn: ['x'], status: 'Doing', completedAt: '2026-01-01' },
        ],
      }),
    );
    const project = result.workspace.projects.at(-1)!;
    expect(project.contactIds).toEqual([known]);
    expect(project.color).toBe(PROJECT_PALETTE[ws.projects.length % PROJECT_PALETTE.length]);
    const [x, y] = result.workspace.tasks.filter((t) => t.projectId === project.id);
    expect(x!.dependsOn).toEqual([y!.id]);
    expect(y!.dependsOn).toEqual([]);
    expect(x!.contactIds).toBeUndefined();
    // completedAt only on Done tasks.
    expect(y!.completedAt).toBeNull();
  });

  it('touches only the projects collection for a project with no tasks', () => {
    const ws = seedWorkspace(TODAY);
    const result = importProject(ws, ctx(), plan({ name: 'Empty' }));
    expect(result.changed).toEqual(['projects']);
    expect(result.workspace.tasks).toBe(ws.tasks);
    expect(result.workspace.files).toBe(ws.files);
  });
});

describe('MS Project conversions (D53)', () => {
  const mpxj = {
    property_values: { project_title: 'Lab Move' },
    tasks: [
      { unique_id: 0, outline_level: 0, name: 'Lab Move', summary: true },
      { unique_id: 1, outline_level: 1, name: 'Design', summary: true, parent_task_unique_id: 0 },
      {
        unique_id: 2,
        outline_level: 2,
        name: 'Floor plan',
        parent_task_unique_id: 1,
        finish: '2026-03-06T17:00:00.0',
        percent_complete: 100,
      },
      {
        unique_id: 3,
        outline_level: 2,
        name: 'Sign-off',
        parent_task_unique_id: 1,
        predecessors: [{ predecessor_task_unique_id: 2 }],
      },
    ],
  };

  it('imports through the same checks, with phases as tags and links intact', () => {
    const p = plan(mpxj);
    expect(p.project.name).toBe('Lab Move');
    expect(p.tasks.map((t) => [t.title, t.status, t.tags])).toEqual([
      ['Floor plan', 'Done', ['design']],
      ['Sign-off', 'Todo', ['design']],
    ]);
    expect(p.warnings).toEqual(['1 summary task became tags']);

    const ws = seedWorkspace(TODAY);
    const result = importProject(ws, ctx(), p);
    const [floor, signOff] = result.workspace.tasks.filter((t) => t.projectId === result.id);
    expect(floor).toMatchObject({ dueDate: '2026-03-06', completedAt: '2026-03-06' });
    expect(signOff!.dependsOn).toEqual([floor!.id]);
  });
});

describe('MS Project XML exports (D54)', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <Title>Lab Move</Title>
  <Tasks>
    <Task><UID>0</UID><Name>Lab Move</Name><OutlineLevel>0</OutlineLevel><Summary>1</Summary></Task>
    <Task><UID>1</UID><Name>Design</Name><OutlineLevel>1</OutlineLevel><Summary>1</Summary></Task>
    <Task>
      <UID>2</UID><Name>Floor plan</Name><OutlineLevel>2</OutlineLevel>
      <Finish>2026-03-06T17:00:00</Finish><PercentComplete>100</PercentComplete>
    </Task>
    <Task>
      <UID>3</UID><Name>Sign-off</Name><OutlineLevel>2</OutlineLevel>
      <PredecessorLink><PredecessorUID>2</PredecessorUID></PredecessorLink>
    </Task>
  </Tasks>
</Project>`;

  it('imports an XML export through the same checks as JSON', () => {
    const parsed = parseProjectImport(xml, TODAY);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const p = parsed.value;
    expect(p.project.name).toBe('Lab Move');
    expect(p.tasks.map((t) => [t.title, t.status, t.tags])).toEqual([
      ['Floor plan', 'Done', ['design']],
      ['Sign-off', 'Todo', ['design']],
    ]);
    const result = importProject(seedWorkspace(TODAY), ctx(), p);
    const [floor, signOff] = result.workspace.tasks.filter((t) => t.projectId === result.id);
    expect(signOff!.dependsOn).toEqual([floor!.id]);
  });

  it('says why an XML file could not be read', () => {
    expect(errorOf('<html></html>')).toBe(
      'Not a Microsoft Project XML file (no <Project> with <Tasks>)',
    );
    expect(errorOf('<Project><Tasks>')).toBe('Invalid XML — <Tasks> is never closed');
  });
});

describe('parseProjectImport / importProject — edge cases', () => {
  it('merges tasks listed beside and inside a wrapped project, dating bad dates today', () => {
    const p = plan({
      project: { name: 'W', createdAt: 'not a date', tasks: [{ title: 'inner' }] },
      tasks: [{ title: 'outer', createdAt: '2026-13-40' }],
    });
    expect(p.tasks.map((t) => t.title)).toEqual(['outer', 'inner']);
    expect(p.project.createdAt).toBe(TODAY);
    expect(p.tasks[0]!.createdAt).toBe(TODAY);
  });

  it('from a one-project export, keeps its tasks and unassigned ones, not another project’s', () => {
    const p = plan({
      projects: [{ id: 'a', name: 'Only' }],
      tasks: [
        { title: 'mine', projectId: 'a' },
        { title: 'loose' },
        { title: 'other', projectId: 'b' },
      ],
    });
    expect(p.tasks.map((t) => t.title)).toEqual(['mine', 'loose']);
  });

  it('ignores a colour that is not #rrggbb', () => {
    expect(plan({ name: 'C', color: 'red' }).project.color).toBeNull();
  });

  it('detaches a note from a task the file did not include', () => {
    const ws = seedWorkspace(TODAY);
    const result = importProject(
      ws,
      ctx(),
      plan({ name: 'F', files: [{ name: 'n.md', kind: 'markdown', taskId: 'ghost' }] }),
    );
    const note = result.workspace.files.find((f) => f.projectId === result.id)!;
    expect(note).toMatchObject({ name: 'n.md', taskId: null });
  });
});
