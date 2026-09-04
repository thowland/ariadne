import type { CollectionName, Workspace } from '../types';

import type { MutationResult } from './mutate';

/**
 * Tag utilities: usage inventory (Settings management), prefix suggestions
 * (tag editors), and rename/merge/delete mutations. Tags are free-form
 * strings; comparisons are case-insensitive but stored casing is preserved.
 */

export interface TagUsage {
  tag: string;
  projects: number;
  tasks: number;
  contacts: number;
}

/** Every tag in use, with per-collection counts, sorted alphabetically. */
export function tagUsage(ws: Workspace): TagUsage[] {
  const byLower = new Map<string, TagUsage>();
  const bump = (tag: string, kind: 'projects' | 'tasks' | 'contacts'): void => {
    const key = tag.toLowerCase();
    let usage = byLower.get(key);
    if (usage === undefined) {
      usage = { tag, projects: 0, tasks: 0, contacts: 0 };
      byLower.set(key, usage);
    }
    usage[kind] += 1;
  };
  for (const p of ws.projects) for (const t of new Set(p.tags)) bump(t, 'projects');
  for (const t of ws.tasks) for (const tag of new Set(t.tags)) bump(tag, 'tasks');
  for (const c of ws.contacts) for (const tag of new Set(c.tags)) bump(tag, 'contacts');
  return [...byLower.values()].sort((a, b) => a.tag.localeCompare(b.tag));
}

/** Distinct known tags (projects + tasks + contacts), sorted. */
export function allKnownTags(ws: Workspace): string[] {
  return tagUsage(ws).map((u) => u.tag);
}

/**
 * Prefix suggestions for a tag editor: known tags starting with the typed
 * text (case-insensitive), excluding ones already on the entity. Capped so
 * the dropdown stays scannable.
 */
export function suggestTags(
  known: readonly string[],
  typed: string,
  exclude: readonly string[],
  limit = 8,
): string[] {
  const prefix = typed.trim().replace(/^#/, '').toLowerCase();
  if (prefix === '') return [];
  const excluded = new Set(exclude.map((t) => t.toLowerCase()));
  return known
    .filter((t) => t.toLowerCase().startsWith(prefix) && !excluded.has(t.toLowerCase()))
    .slice(0, limit);
}

function normalizeTag(raw: string): string {
  return raw.trim().replace(/^#/, '');
}

function replaceInList(tags: string[], fromLower: string, to: string): string[] | null {
  if (!tags.some((t) => t.toLowerCase() === fromLower)) return null;
  const next: string[] = [];
  for (const t of tags) {
    const candidate = t.toLowerCase() === fromLower ? to : t;
    if (!next.some((x) => x.toLowerCase() === candidate.toLowerCase())) next.push(candidate);
  }
  return next;
}

/**
 * Rename `from` to `to` everywhere. When `to` already exists on an entity
 * the lists de-duplicate, so renaming onto an existing tag is a merge.
 */
export function renameTag(ws: Workspace, from: string, to: string): MutationResult {
  const target = normalizeTag(to);
  const fromLower = normalizeTag(from).toLowerCase();
  if (target === '' || fromLower === '' || target.toLowerCase() === fromLower) {
    return { workspace: ws, changed: [] };
  }

  const changed: CollectionName[] = [];
  let projects = ws.projects;
  let tasks = ws.tasks;
  let contacts = ws.contacts;

  const nextProjects = ws.projects.map((p) => {
    const next = replaceInList(p.tags, fromLower, target);
    return next === null ? p : { ...p, tags: next };
  });
  if (nextProjects.some((p, i) => p !== ws.projects[i])) {
    projects = nextProjects;
    changed.push('projects');
  }

  const nextTasks = ws.tasks.map((t) => {
    const next = replaceInList(t.tags, fromLower, target);
    return next === null ? t : { ...t, tags: next };
  });
  if (nextTasks.some((t, i) => t !== ws.tasks[i])) {
    tasks = nextTasks;
    changed.push('tasks');
  }

  const nextContacts = ws.contacts.map((c) => {
    const next = replaceInList(c.tags, fromLower, target);
    return next === null ? c : { ...c, tags: next };
  });
  if (nextContacts.some((c, i) => c !== ws.contacts[i])) {
    contacts = nextContacts;
    changed.push('contacts');
  }

  if (changed.length === 0) return { workspace: ws, changed: [] };
  return { workspace: { ...ws, projects, tasks, contacts }, changed };
}

/** Remove the tag from every project, task, and contact. */
export function deleteTag(ws: Workspace, tag: string): MutationResult {
  const lower = normalizeTag(tag).toLowerCase();
  if (lower === '') return { workspace: ws, changed: [] };

  const changed: CollectionName[] = [];
  let projects = ws.projects;
  let tasks = ws.tasks;
  let contacts = ws.contacts;

  const nextProjects = ws.projects.map((p) =>
    p.tags.some((t) => t.toLowerCase() === lower)
      ? { ...p, tags: p.tags.filter((t) => t.toLowerCase() !== lower) }
      : p,
  );
  if (nextProjects.some((p, i) => p !== ws.projects[i])) {
    projects = nextProjects;
    changed.push('projects');
  }

  const nextTasks = ws.tasks.map((t) =>
    t.tags.some((x) => x.toLowerCase() === lower)
      ? { ...t, tags: t.tags.filter((x) => x.toLowerCase() !== lower) }
      : t,
  );
  if (nextTasks.some((t, i) => t !== ws.tasks[i])) {
    tasks = nextTasks;
    changed.push('tasks');
  }

  const nextContacts = ws.contacts.map((c) =>
    c.tags.some((x) => x.toLowerCase() === lower)
      ? { ...c, tags: c.tags.filter((x) => x.toLowerCase() !== lower) }
      : c,
  );
  if (nextContacts.some((c, i) => c !== ws.contacts[i])) {
    contacts = nextContacts;
    changed.push('contacts');
  }

  if (changed.length === 0) return { workspace: ws, changed: [] };
  return { workspace: { ...ws, projects, tasks, contacts }, changed };
}

// ---------- Inline #hashtags ----------

/** The `#…` token the caret currently sits in. */
export interface HashtagQuery {
  /** Index of the `#`. */
  start: number;
  /** Index one past the last typed character (the caret). */
  end: number;
  /** The typed text after the `#`, possibly empty. */
  query: string;
}

/**
 * Longest fragment an inline hashtag will consider. Past this the user is
 * writing prose that happens to contain a `#`, not picking a tag.
 */
const MAX_HASHTAG_LEN = 32;

/** Characters allowed inside an inline hashtag. Tag-shaped, never a space. */
const HASHTAG_CHAR = /[-_\p{L}\p{N}'’.]/u;

/**
 * Rows for the `#` tag picker (D40). A bare `#` lists the whole vocabulary —
 * typing the sigil is itself the request to see what exists — while anything
 * typed after it narrows through `suggestTags`. Both lists are alphabetical,
 * which is the order `allKnownTags` already returns.
 */
export function hashtagCandidates(
  known: readonly string[],
  typed: string,
  exclude: readonly string[] = [],
  limit = 8,
): string[] {
  if (typed.trim() !== '') return suggestTags(known, typed, exclude, limit);
  const excluded = new Set(exclude.map((t) => t.toLowerCase()));
  return known.filter((t) => !excluded.has(t.toLowerCase())).slice(0, limit);
}

/**
 * Finds the hashtag the caret is inside, or null.
 *
 * Anchored exactly like the @-mention (D31) and the date rules (D29): the `#`
 * must start the text or follow whitespace or an opening bracket, which is
 * what keeps "C#" and "issue#3" from opening a tag picker. Unlike a mention
 * there is no inner space — a tag is one token in prose, and swallowing the
 * next word would turn the rest of the sentence into the query.
 */
export function findHashtag(text: string, caret: number): HashtagQuery | null {
  const end = Math.max(0, Math.min(caret, text.length));
  for (let i = end - 1; i >= 0 && end - i <= MAX_HASHTAG_LEN; i -= 1) {
    const ch = text.charAt(i);
    if (ch === '#') {
      const before = i === 0 ? '' : text.charAt(i - 1);
      if (before !== '' && !/[\s([{]/.test(before)) return null;
      return { start: i, end, query: text.slice(i + 1, end) };
    }
    if (!HASHTAG_CHAR.test(ch)) return null;
  }
  return null;
}

/**
 * Completes a hashtag in place: the typed fragment becomes the full tag, `#`
 * and all. The tag **stays in the title** for the same reason a picked
 * mention does (D31) — the chip below the field is the durable link, the text
 * is how the task reads to a human.
 */
export function completeHashtag(
  text: string,
  hashtag: HashtagQuery,
  tag: string,
): { text: string; caret: number } {
  const inserted = `#${tag}`;
  const before = text.slice(0, hashtag.start);
  return {
    text: before + inserted + text.slice(hashtag.end),
    caret: before.length + inserted.length,
  };
}

/**
 * Blanks out `#tag` runs, keeping the string's length and every offset.
 *
 * Load-bearing for the same reason `maskMentions` is: `#mar` and `#sat` are
 * D29 date vocabulary, and `#` is a non-word character, so the `\b`-anchored
 * date rules read straight through it and would silently set a due date
 * nobody asked for. Tags are not prose, so they come out before it is parsed.
 */
export function maskHashtags(text: string): string {
  return text.replace(
    /(^|[\s([{])#[-_\p{L}\p{N}'’.]+/gu,
    (run, boundary: string) => boundary + ' '.repeat(run.length - boundary.length),
  );
}

/**
 * Takes the `#tag` words back out of a title once they have been applied
 * (D40, following D35). The chip is the durable copy; leaving the word in the
 * text gives the tag two homes that disagree the moment one is renamed.
 *
 * Only runs matching a tag actually on the entity are removed — a `#kayak`
 * the user typed and never picked is still prose, and stays exactly as
 * written, the same way a date phrase waved off with the chip does.
 */
export function stripHashtags(text: string, tags: readonly string[]): string {
  if (tags.length === 0) return text;
  const wanted = new Set(tags.map((t) => t.trim().toLowerCase()));
  const stripped = text.replace(
    /(^|[\s([{])#([-_\p{L}\p{N}'’.]+)/gu,
    (run, boundary: string, tag: string) => (wanted.has(tag.toLowerCase()) ? boundary : run),
  );
  if (stripped === text) return text;
  return (
    stripped
      // Collapse the double space a mid-sentence removal leaves, and the
      // orphaned space it leaves in front of punctuation.
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/[ \t]+([,;:.!?])/g, '$1')
      .replace(/[,;:\s]+$/, '')
      .trim()
  );
}
