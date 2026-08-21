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
