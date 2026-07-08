import { describe, expect, it } from 'vitest';

import { seedWorkspace } from '../domain/seed';

import { buildExport, parseImport } from './import-export';

const TODAY = '2026-07-08';

function ids(): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `import-${n}`;
  };
}

describe('buildExport / parseImport round trip', () => {
  it('round-trips a native export unchanged', () => {
    const ws = seedWorkspace(TODAY);
    const doc = buildExport(ws, { blob1: 'data:text/plain;base64,aGk=' });
    const parsed = parseImport(JSON.stringify(doc), ids());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.workspace.projects).toEqual(ws.projects);
    expect(parsed.value.workspace.tasks).toEqual(ws.tasks);
    expect(parsed.value.workspace.files).toEqual(ws.files);
    expect(parsed.value.blobs).toEqual({ blob1: 'data:text/plain;base64,aGk=' });
    expect(parsed.value.warnings).toEqual([]);
  });
});

describe('parseImport — prototype compatibility', () => {
  it('migrates legacy project.docs[] into ref FileEntries', () => {
    const prototypeExport = {
      projects: [
        {
          id: 'p1',
          name: 'Legacy project',
          category: 'work',
          tags: [],
          color: '#4f5bd5',
          status: 'Active',
          notes: '',
          links: [],
          docs: [
            { name: 'Architecture diagram v3', note: 'Current + target topology' },
            { name: 'Rollback plan', note: 'Owned by SRE' },
          ],
          createdAt: '2026-06-01',
        },
      ],
      tasks: [
        {
          id: 't1',
          projectId: 'p1',
          title: 'Old task',
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
        },
      ],
      // No files, no settings — prototype pre-migration shape.
    };
    const parsed = parseImport(JSON.stringify(prototypeExport), ids());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const refs = parsed.value.workspace.files;
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({
      kind: 'ref',
      projectId: 'p1',
      name: 'Architecture diagram v3',
      note: 'Current + target topology',
    });
    expect(parsed.value.workspace.settings.todoistToken).toBe('');
    expect(parsed.value.warnings.some((w) => w.includes('Migrated 2 legacy'))).toBe(true);
  });

  it('collects _blobs data URLs and ignores junk entries', () => {
    const ws = seedWorkspace(TODAY);
    const doc = {
      ...buildExport(ws, {}),
      _blobs: { good: 'data:image/png;base64,AAAA', bad: 'http://nope', worse: 42 },
    };
    const parsed = parseImport(JSON.stringify(doc), ids());
    expect(parsed.ok && parsed.value.blobs).toEqual({ good: 'data:image/png;base64,AAAA' });
  });

  it('repairs referential damage through normalization', () => {
    const ws = seedWorkspace(TODAY);
    const doc = buildExport(ws, {});
    doc.tasks = [...doc.tasks, { ...ws.tasks[0]!, id: 'orphan', projectId: 'ghost' }];
    const parsed = parseImport(JSON.stringify(doc), ids());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.workspace.tasks.some((t) => t.id === 'orphan')).toBe(false);
    expect(parsed.value.warnings.length).toBeGreaterThan(0);
  });

  it('rejects invalid JSON and non-export documents', () => {
    expect(parseImport('{oops', ids())).toEqual({
      ok: false,
      error: 'Invalid JSON — import failed',
    });
    expect(parseImport('42', ids()).ok).toBe(false);
    expect(parseImport('{"hello":"world"}', ids())).toMatchObject({
      ok: false,
      error: expect.stringContaining('missing projects/tasks') as string,
    });
  });
});
