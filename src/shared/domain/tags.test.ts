import { describe, expect, it } from 'vitest';

import { seedWorkspace } from './seed';
import { allKnownTags, deleteTag, renameTag, suggestTags, tagUsage } from './tags';

const TODAY = '2026-07-08';

function wsWithTaskTags() {
  const ws = seedWorkspace(TODAY);
  ws.tasks = ws.tasks.map((t, i) =>
    i === 0 ? { ...t, tags: ['infra', 'urgent'] } : i === 1 ? { ...t, tags: ['Urgent'] } : t,
  );
  return ws;
}

describe('tagUsage / allKnownTags', () => {
  it('counts distinct usage per collection, case-insensitively', () => {
    const usage = tagUsage(wsWithTaskTags());
    const infra = usage.find((u) => u.tag === 'infra');
    expect(infra).toEqual({ tag: 'infra', projects: 1, tasks: 1 });
    // 'urgent' + 'Urgent' collapse into one entry (first-seen casing kept).
    const urgent = usage.find((u) => u.tag.toLowerCase() === 'urgent');
    expect(urgent).toMatchObject({ projects: 0, tasks: 2 });
    expect(usage.filter((u) => u.tag.toLowerCase() === 'urgent')).toHaveLength(1);
  });

  it('lists known tags sorted', () => {
    const tags = allKnownTags(seedWorkspace(TODAY));
    expect(tags).toEqual([...tags].sort((a, b) => a.localeCompare(b)));
    expect(tags).toContain('woodworking');
    expect(tags).toContain('q3');
  });
});

describe('suggestTags', () => {
  const known = ['infra', 'Infrastructure', 'finance', 'hiring', 'q3'];

  it('prefix-matches case-insensitively', () => {
    expect(suggestTags(known, 'in', [])).toEqual(['infra', 'Infrastructure']);
    expect(suggestTags(known, 'INF', [])).toEqual(['infra', 'Infrastructure']);
    expect(suggestTags(known, 'fi', [])).toEqual(['finance']);
  });

  it('ignores a leading # and surrounding whitespace', () => {
    expect(suggestTags(known, ' #inf ', [])).toEqual(['infra', 'Infrastructure']);
  });

  it('excludes tags already on the entity and respects the cap', () => {
    expect(suggestTags(known, 'in', ['infra'])).toEqual(['Infrastructure']);
    expect(suggestTags(['a1', 'a2', 'a3'], 'a', [], 2)).toEqual(['a1', 'a2']);
  });

  it('suggests nothing for empty input', () => {
    expect(suggestTags(known, '', [])).toEqual([]);
    expect(suggestTags(known, '  #  ', [])).toEqual([]);
  });
});

describe('renameTag', () => {
  it('renames across projects and tasks', () => {
    const ws = wsWithTaskTags();
    const r = renameTag(ws, 'infra', 'platform');
    expect(r.changed.sort()).toEqual(['projects', 'tasks']);
    expect(r.workspace.projects[0]?.tags).toEqual(['platform', 'q3']);
    expect(r.workspace.tasks[0]?.tags).toEqual(['platform', 'urgent']);
  });

  it('renaming onto an existing tag merges (deduplicates)', () => {
    const ws = wsWithTaskTags();
    const r = renameTag(ws, 'infra', 'q3'); // p1 has both infra and q3
    expect(r.workspace.projects[0]?.tags).toEqual(['q3']);
  });

  it('matches case-insensitively and preserves the new casing', () => {
    const ws = wsWithTaskTags();
    const r = renameTag(ws, 'URGENT', 'follow-up');
    expect(r.workspace.tasks[0]?.tags).toEqual(['infra', 'follow-up']);
    expect(r.workspace.tasks[1]?.tags).toEqual(['follow-up']);
  });

  it('is a no-op for unknown, empty, or identical names', () => {
    const ws = seedWorkspace(TODAY);
    expect(renameTag(ws, 'ghost-tag', 'x').changed).toEqual([]);
    expect(renameTag(ws, 'infra', 'infra').changed).toEqual([]);
    expect(renameTag(ws, 'infra', '  ').changed).toEqual([]);
    expect(renameTag(ws, 'infra', 'x').workspace.tasks).toBe(ws.tasks); // tasks untouched
  });
});

describe('deleteTag', () => {
  it('removes the tag everywhere, case-insensitively', () => {
    const ws = wsWithTaskTags();
    const r = deleteTag(ws, 'Urgent');
    expect(r.changed).toEqual(['tasks']);
    expect(r.workspace.tasks[0]?.tags).toEqual(['infra']);
    expect(r.workspace.tasks[1]?.tags).toEqual([]);
  });

  it('reports project-only changes minimally', () => {
    const ws = seedWorkspace(TODAY);
    const r = deleteTag(ws, 'woodworking');
    expect(r.changed).toEqual(['projects']);
    expect(r.workspace.projects.find((p) => p.id === 'p3')?.tags).toEqual([]);
  });

  it('is a no-op for unknown tags', () => {
    const ws = seedWorkspace(TODAY);
    const r = deleteTag(ws, 'nope');
    expect(r.changed).toEqual([]);
    expect(r.workspace).toBe(ws);
  });
});
