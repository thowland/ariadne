import { describe, expect, it } from 'vitest';

import { findNlDate } from './nl-date';
import { seedWorkspace } from './seed';
import {
  allKnownTags,
  completeHashtag,
  deleteTag,
  findHashtag,
  hashtagCandidates,
  maskHashtags,
  renameTag,
  stripHashtags,
  suggestTags,
  tagUsage,
} from './tags';

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
    expect(infra).toEqual({ tag: 'infra', projects: 1, tasks: 1, contacts: 0 });
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

describe('findHashtag', () => {
  it('finds the token the caret sits in, empty query included', () => {
    expect(findHashtag('Sand the top #', 14)).toEqual({ start: 13, end: 14, query: '' });
    expect(findHashtag('Sand the top #wood', 18)).toEqual({ start: 13, end: 18, query: 'wood' });
    expect(findHashtag('#wood at the front', 5)).toEqual({ start: 0, end: 5, query: 'wood' });
  });

  it('requires the anchor that keeps prose out of the picker', () => {
    // Mid-word `#` is a sharp or an issue number, not a tag.
    expect(findHashtag('Learn C#', 8)).toBeNull();
    expect(findHashtag('Close issue#42', 14)).toBeNull();
    // A bracket opens one, the same way it opens a mention.
    expect(findHashtag('Sand it (#wood', 14)).not.toBeNull();
  });

  it('stops at a space — a tag is one token, not the rest of the sentence', () => {
    expect(findHashtag('#wood and varnish', 17)).toBeNull();
  });

  it('gives up past the length limit', () => {
    const long = `#${'a'.repeat(40)}`;
    expect(findHashtag(long, long.length)).toBeNull();
  });

  it('clamps a caret outside the string', () => {
    expect(findHashtag('#wood', 99)).toEqual({ start: 0, end: 5, query: 'wood' });
    expect(findHashtag('#wood', -3)).toBeNull();
  });
});

describe('hashtagCandidates', () => {
  const known = ['finance', 'infra', 'q3', 'woodworking'];

  it('lists the whole vocabulary for a bare #', () => {
    expect(hashtagCandidates(known, '')).toEqual(known);
  });

  it('narrows on what is typed and honours the exclude list', () => {
    expect(hashtagCandidates(known, 'in')).toEqual(['infra']);
    expect(hashtagCandidates(known, '', ['INFRA'])).toEqual(['finance', 'q3', 'woodworking']);
  });

  it('caps the list', () => {
    expect(hashtagCandidates(known, '', [], 2)).toHaveLength(2);
  });
});

describe('completeHashtag', () => {
  it('replaces the typed fragment in place and returns the caret', () => {
    const q = findHashtag('Sand the #wood today', 14);
    expect(q).not.toBeNull();
    expect(completeHashtag('Sand the #wood today', q!, 'woodworking')).toEqual({
      text: 'Sand the #woodworking today',
      caret: 21,
    });
  });
});

describe('maskHashtags', () => {
  it('blanks tags while preserving every offset', () => {
    const text = 'Ship #mar release';
    const masked = maskHashtags(text);
    expect(masked).toHaveLength(text.length);
    expect(masked).toBe('Ship      release');
  });

  it('leaves a mid-word # alone', () => {
    expect(maskHashtags('Learn C# today')).toBe('Learn C# today');
  });

  it('keeps the date scanner off a tag that spells a month or a day', () => {
    // The interaction D40 exists to prevent: `#` is a non-word character, so
    // the \b-anchored D29 rules read straight through it.
    expect(findNlDate('Ship #sat prep', TODAY)?.date).toBe('2026-07-11');
    expect(findNlDate(maskHashtags('Ship #sat prep'), TODAY)).toBeNull();
    // The month form drags a number in with it, which is worse: a tag turns
    // into a due date nine months out.
    expect(findNlDate('Ship #mar 5 build', TODAY)?.date).toBe('2027-03-05');
    expect(findNlDate(maskHashtags('Ship #mar 5 build'), TODAY)).toBeNull();
  });
});

describe('stripHashtags', () => {
  it('takes an applied tag back out of the title', () => {
    expect(stripHashtags('Strip the varnish #woodworking', ['woodworking'])).toBe(
      'Strip the varnish',
    );
  });

  it('leaves a word nobody picked exactly as typed', () => {
    expect(stripHashtags('Try the #kayak rack', ['woodworking'])).toBe('Try the #kayak rack');
    expect(stripHashtags('Try the #kayak rack', [])).toBe('Try the #kayak rack');
  });

  it('matches case-insensitively, the way the rest of the tag code does', () => {
    expect(stripHashtags('Sand it #Woodworking', ['woodworking'])).toBe('Sand it');
  });

  it('tidies the hole a mid-sentence removal leaves', () => {
    expect(stripHashtags('Sand #wood the top', ['wood'])).toBe('Sand the top');
    expect(stripHashtags('Sand the top, #wood', ['wood'])).toBe('Sand the top');
    expect(stripHashtags('Sand #wood, then varnish', ['wood'])).toBe('Sand, then varnish');
  });

  it('removes every applied tag, not just the first', () => {
    expect(stripHashtags('Ship #infra #q3 work', ['infra', 'q3'])).toBe('Ship work');
  });

  it('leaves a mid-word # alone', () => {
    expect(stripHashtags('Learn C# properly', ['c'])).toBe('Learn C# properly');
  });

  it('returns the original string when nothing matched', () => {
    const text = 'Nothing to do here';
    expect(stripHashtags(text, ['wood'])).toBe(text);
  });
});
