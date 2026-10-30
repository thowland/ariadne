import { beforeEach, describe, expect, it } from 'vitest';

import { loadTestWorkspace, setupTestApp } from '../test-utils';

import { useStore } from './store';
import { runProjectJsonImport } from './workspace-io';

beforeEach(() => {
  setupTestApp();
  loadTestWorkspace();
});

const json = (doc: unknown, name = 'project.json'): File =>
  new File([JSON.stringify(doc)], name, { type: 'application/json' });

describe('runProjectJsonImport (D52)', () => {
  it('adds the project, opens it, and says how many tasks came in', async () => {
    const before = useStore.getState().workspace!.projects.length;
    const ok = await runProjectJsonImport(json({ name: 'Garden', tasks: [{ title: 'Seeds' }] }));
    expect(ok).toBe(true);
    const state = useStore.getState();
    expect(state.workspace!.projects).toHaveLength(before + 1);
    const added = state.workspace!.projects.at(-1)!;
    expect(added.name).toBe('Garden');
    expect(state.view).toBe('project');
    expect(state.activeProjectId).toBe(added.id);
    expect(state.toast).toBe('Imported Garden with 1 task');
  });

  it('adds what was left out to the message', async () => {
    await runProjectJsonImport(
      json({
        name: 'Docs',
        tasks: [{ title: 'a' }, { title: 'b' }],
        files: [{ name: 'scan.pdf', kind: 'file', size: 10 }],
      }),
    );
    expect(useStore.getState().toast).toBe(
      'Imported Docs with 2 tasks — 1 uploaded file left out (JSON carries no file contents)',
    );
  });

  it('names an unnamed project in the message', async () => {
    await runProjectJsonImport(json({ name: '' }));
    expect(useStore.getState().toast).toBe('Imported Project with 0 tasks');
  });

  it('reads an MS Project XML export (D54)', async () => {
    const xml =
      '<Project><Title>Lab Move</Title><Tasks>' +
      '<Task><UID>1</UID><Name>Design</Name><OutlineLevel>1</OutlineLevel><Summary>1</Summary></Task>' +
      '<Task><UID>2</UID><Name>Floor plan</Name><OutlineLevel>2</OutlineLevel></Task>' +
      '</Tasks></Project>';
    expect(await runProjectJsonImport(new File([xml], 'plan.xml', { type: 'text/xml' }))).toBe(
      true,
    );
    const ws = useStore.getState().workspace!;
    const added = ws.projects.at(-1)!;
    expect(added.name).toBe('Lab Move');
    expect(ws.tasks.filter((t) => t.projectId === added.id).map((t) => t.tags)).toEqual([
      ['design'],
    ]);
    expect(useStore.getState().toast).toBe(
      'Imported Lab Move with 1 task — 1 summary task became tags',
    );
  });

  it('leaves the workspace alone and explains a file it cannot use', async () => {
    const before = useStore.getState().workspace;
    expect(await runProjectJsonImport(json({ projects: [{}, {}] }))).toBe(false);
    expect(useStore.getState().workspace).toBe(before);
    expect(useStore.getState().toast).toMatch(/holds 2 projects/);
  });

  it('says so when the file cannot be read at all', async () => {
    const broken = new File(['x'], 'locked.json');
    broken.text = () => Promise.reject(new Error('permission denied'));
    expect(await runProjectJsonImport(broken)).toBe(false);
    expect(useStore.getState().toast).toBe('Could not read “locked.json”');
  });

  it('does nothing before a workspace has loaded', async () => {
    useStore.setState({ workspace: null });
    expect(await runProjectJsonImport(json({ name: 'Early' }))).toBe(false);
    expect(useStore.getState().workspace).toBeNull();
  });
});
