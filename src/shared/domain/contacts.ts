import type { Contact, IsoDate, Project, Task, Workspace } from '../types';

import { isOpen, isOverdue } from './derive';

/**
 * Contacts (D31): naming, lookup, the project↔contact join, and the
 * @-mention parser. Pure like the rest of `shared/domain` — `today` is always
 * a parameter and nothing here reaches for a clock.
 *
 * The join is deliberately one-directional. A task owns its `contactIds`; a
 * project owns only the people attached to the project *itself*. What the
 * project's Contacts card shows is the union, computed here by
 * `projectContacts`, so linking a person to a task can never leave two lists
 * disagreeing about who is involved.
 */

/** `First Last`, collapsed; falls back to whatever single field exists. */
export function contactName(c: Contact): string {
  const full = `${c.firstName.trim()} ${c.lastName.trim()}`.trim();
  if (full !== '') return full;
  if (c.company.trim() !== '') return c.company.trim();
  return 'Unnamed contact';
}

/** `Last, First` — the sort key for the contacts screen's name column. */
export function contactSortName(c: Contact): string {
  const last = c.lastName.trim();
  const first = c.firstName.trim();
  if (last !== '' && first !== '') return `${last}, ${first}`.toLowerCase();
  return contactName(c).toLowerCase();
}

/** One or two letters for the avatar chip; never empty. */
export function contactInitials(c: Contact): string {
  const letters = [c.firstName, c.lastName]
    .map((part) => part.trim()[0] ?? '')
    .filter((ch) => ch !== '')
    .join('');
  if (letters !== '') return letters.toUpperCase();
  return (contactName(c)[0] ?? '?').toUpperCase();
}

/** Stable palette slot for a contact's avatar, derived from its id. */
export function contactColor(c: Contact, palette: readonly string[]): string {
  let hash = 0;
  for (const ch of c.id) hash = (hash * 31 + ch.charCodeAt(0)) % 100_000;
  return palette[hash % palette.length] ?? '#4f5bd5';
}

export function contactById(ws: Workspace, id: string): Contact | undefined {
  return ws.contacts.find((c) => c.id === id);
}

/** Contacts linked to a task, in workspace order (never `undefined` holes). */
export function contactsOfTask(ws: Workspace, task: Task): Contact[] {
  const ids = new Set(task.contactIds ?? []);
  return ids.size === 0 ? [] : ws.contacts.filter((c) => ids.has(c.id));
}

/**
 * How a contact reached a project's Contacts card. `direct` means someone
 * added them to the project; `task` means they are only there because they
 * are on one of its tasks. Both is `direct` — the explicit link is the
 * stronger statement and is the one the card lets you remove.
 */
export type ContactSource = 'direct' | 'task';

export interface ProjectContact {
  contact: Contact;
  source: ContactSource;
  /** Open tasks in this project linked to them. */
  openTasks: number;
  /** All tasks in this project linked to them, Done and Dropped included. */
  totalTasks: number;
}

/**
 * Everyone involved in a project: the project's own `contactIds` plus every
 * contact on one of its tasks. Ordered directly-attached first, then by task
 * count, then by name, so the people someone deliberately filed against the
 * project head the list.
 */
export function projectContacts(ws: Workspace, projectId: string): ProjectContact[] {
  const project = ws.projects.find((p) => p.id === projectId);
  if (project === undefined) return [];
  const direct = new Set(project.contactIds ?? []);
  const tasks = ws.tasks.filter((t) => t.projectId === projectId);

  const counts = new Map<string, { open: number; total: number }>();
  for (const t of tasks) {
    for (const id of new Set(t.contactIds ?? [])) {
      const entry = counts.get(id) ?? { open: 0, total: 0 };
      entry.total += 1;
      if (isOpen(t)) entry.open += 1;
      counts.set(id, entry);
    }
  }

  const rows: ProjectContact[] = [];
  for (const contact of ws.contacts) {
    const isDirect = direct.has(contact.id);
    const count = counts.get(contact.id);
    if (!isDirect && count === undefined) continue;
    rows.push({
      contact,
      source: isDirect ? 'direct' : 'task',
      openTasks: count?.open ?? 0,
      totalTasks: count?.total ?? 0,
    });
  }

  return rows.sort(
    (a, b) =>
      Number(b.source === 'direct') - Number(a.source === 'direct') ||
      b.totalTasks - a.totalTasks ||
      contactSortName(a.contact).localeCompare(contactSortName(b.contact)),
  );
}

/** Every task linked to a contact, newest-due first with undated last. */
export function tasksOfContact(ws: Workspace, contactId: string): Task[] {
  return ws.tasks.filter((t) => (t.contactIds ?? []).includes(contactId));
}

/**
 * Projects a contact touches: the ones they are directly attached to, plus
 * the ones holding a task they are linked to. Workspace order (= sidebar
 * order), so the detail page reads like the sidebar.
 */
export function projectsOfContact(ws: Workspace, contactId: string): Project[] {
  const ids = new Set(
    ws.tasks.filter((t) => (t.contactIds ?? []).includes(contactId)).map((t) => t.projectId),
  );
  for (const p of ws.projects) if ((p.contactIds ?? []).includes(contactId)) ids.add(p.id);
  return ws.projects.filter((p) => ids.has(p.id));
}

// ---------- The contacts inventory screen ----------

export interface ContactRow {
  contact: Contact;
  open: number;
  done: number;
  overdue: number;
  projects: number;
  /** Latest completion or creation date across their tasks; null if none. */
  lastActivity: IsoDate | null;
}

/** Per-contact counts for the Contacts screen. Counts the whole workspace. */
export function contactRollup(ws: Workspace, today: IsoDate): ContactRow[] {
  return ws.contacts.map((contact) => {
    const tasks = tasksOfContact(ws, contact.id);
    const dates = tasks.map((t) => t.completedAt ?? t.createdAt).sort();
    return {
      contact,
      open: tasks.filter(isOpen).length,
      done: tasks.filter((t) => t.status === 'Done').length,
      overdue: tasks.filter((t) => isOverdue(t, today)).length,
      projects: projectsOfContact(ws, contact.id).length,
      lastActivity: dates[dates.length - 1] ?? null,
    };
  });
}

/** Sortable columns of the contacts table, in display order. */
export const CONTACT_COLUMNS = [
  ['name', 'Name'],
  ['company', 'Company'],
  ['role', 'Role'],
  ['open', 'Open'],
  ['done', 'Done'],
  ['projects', 'Projects'],
  ['last', 'Last activity'],
] as const;

export type ContactSortKey = (typeof CONTACT_COLUMNS)[number][0];
export type SortDirection = 'asc' | 'desc';

/**
 * Sorts a copy of the rollup. Like `sortPortfolio`, ties always fall back to
 * the name so the order is total, and "never" (no recorded activity) sinks in
 * both directions — the absence of a date is not a date.
 */
export function sortContacts(
  rows: readonly ContactRow[],
  key: ContactSortKey,
  direction: SortDirection,
): ContactRow[] {
  const sign = direction === 'asc' ? 1 : -1;
  const name = (r: ContactRow): string => contactSortName(r.contact);
  const compare = (a: ContactRow, b: ContactRow): number => {
    switch (key) {
      case 'name':
        return name(a).localeCompare(name(b));
      case 'company':
        return a.contact.company.toLowerCase().localeCompare(b.contact.company.toLowerCase());
      case 'role':
        return a.contact.role.toLowerCase().localeCompare(b.contact.role.toLowerCase());
      case 'open':
        return a.open - b.open;
      case 'done':
        return a.done - b.done;
      case 'projects':
        return a.projects - b.projects;
      case 'last': {
        if (a.lastActivity === null || b.lastActivity === null) {
          if (a.lastActivity === null && b.lastActivity === null) return 0;
          return (a.lastActivity === null ? 1 : -1) * sign;
        }
        return a.lastActivity.localeCompare(b.lastActivity);
      }
    }
  };
  return [...rows].sort((a, b) => {
    const primary = compare(a, b) * sign;
    return primary !== 0 ? primary : name(a).localeCompare(name(b));
  });
}

// ---------- Autocomplete and @-mentions ----------

/**
 * Contacts matching typed text, best match first: first-name prefix, then
 * full-name prefix, then last name, then company. Substring matches come last
 * so "@rey" still finds Dana Reyes without burying the people whose first
 * name actually starts that way.
 */
export function suggestContacts(
  contacts: readonly Contact[],
  typed: string,
  exclude: readonly string[] = [],
  limit = 8,
): Contact[] {
  const q = typed.trim().replace(/^@/, '').toLowerCase();
  if (q === '') return [];
  const excluded = new Set(exclude);

  const scored: { contact: Contact; score: number }[] = [];
  for (const c of contacts) {
    if (excluded.has(c.id)) continue;
    const first = c.firstName.toLowerCase();
    const last = c.lastName.toLowerCase();
    const full = contactName(c).toLowerCase();
    const company = c.company.toLowerCase();
    let score = -1;
    if (first.startsWith(q)) score = 0;
    else if (full.startsWith(q)) score = 1;
    else if (last.startsWith(q)) score = 2;
    else if (company.startsWith(q)) score = 3;
    else if (full.includes(q)) score = 4;
    else if (company.includes(q)) score = 5;
    if (score >= 0) scored.push({ contact: c, score });
  }

  return scored
    .sort(
      (a, b) =>
        a.score - b.score || contactSortName(a.contact).localeCompare(contactSortName(b.contact)),
    )
    .slice(0, limit)
    .map((s) => s.contact);
}

/**
 * Rows for the @-mention picker. A bare `@` lists everybody — typing the
 * sigil is itself the request to see who is available — while anything typed
 * after it narrows through `suggestContacts`. The unfiltered list is ordered
 * by display name, because that is the half of the name the user is about to
 * type; the narrowed list keeps `suggestContacts`' relevance ranking.
 */
export function mentionCandidates(
  contacts: readonly Contact[],
  typed: string,
  exclude: readonly string[] = [],
  limit = 8,
): Contact[] {
  if (typed.trim() !== '') return suggestContacts(contacts, typed, exclude, limit);
  const excluded = new Set(exclude);
  return contacts
    .filter((c) => !excluded.has(c.id))
    .sort((a, b) => contactName(a).toLowerCase().localeCompare(contactName(b).toLowerCase()))
    .slice(0, limit);
}

/** The `@…` token the caret currently sits in. */
export interface MentionQuery {
  /** Index of the `@`. */
  start: number;
  /** Index one past the last typed character (the caret). */
  end: number;
  /** The typed text after the `@`, possibly empty. */
  query: string;
}

/**
 * Longest name fragment an @-mention will consider. Past this the user is
 * writing prose that happens to contain an `@`, not picking a person.
 */
const MAX_MENTION_LEN = 32;

/** Characters allowed inside a mention: name-shaped, plus one inner space. */
const MENTION_CHAR = /[-\p{L}\p{N}'’.]/u;

/**
 * Finds the mention the caret is inside, or null.
 *
 * Anchored like the natural-language date rules (D29): the `@` must start the
 * text or follow whitespace or an opening bracket, which is what keeps an
 * email address in a title from opening a people picker. A single inner space
 * is allowed so "@dana r" can disambiguate two Danas, but a second space ends
 * the mention — otherwise the rest of the sentence becomes the query.
 */
export function findMention(text: string, caret: number): MentionQuery | null {
  const end = Math.max(0, Math.min(caret, text.length));
  let spaces = 0;
  for (let i = end - 1; i >= 0 && end - i <= MAX_MENTION_LEN; i -= 1) {
    const ch = text.charAt(i);
    if (ch === '@') {
      const before = i === 0 ? '' : text.charAt(i - 1);
      if (before !== '' && !/[\s([{]/.test(before)) return null;
      return { start: i, end, query: text.slice(i + 1, end) };
    }
    if (ch === ' ') {
      spaces += 1;
      // Two spaces back and still no '@': the caret is not in a mention.
      if (spaces > 1) return null;
      continue;
    }
    if (!MENTION_CHAR.test(ch)) return null;
  }
  return null;
}

/**
 * Completes a mention in place: the typed fragment becomes the contact's full
 * name, `@` and all. Returns the new text and where the caret should land.
 *
 * The name **stays in the title**, for the same reason a D29 date phrase does:
 * "Ask @Dana Reyes about the budget" reads as a sentence, and a title that
 * silently loses the word you just typed is disorienting. The chip below the
 * field is the durable link; the text is how the task reads to a human.
 */
export function completeMention(
  text: string,
  mention: MentionQuery,
  name: string,
): { text: string; caret: number } {
  const inserted = `@${name}`;
  const before = text.slice(0, mention.start);
  return {
    text: before + inserted + text.slice(mention.end),
    caret: before.length + inserted.length,
  };
}

// ---------- Search ----------

/**
 * Top-bar search over contacts: name, company, role, email, phone, tags and
 * notes. Phone matching ignores punctuation, so "5551234" finds
 * "(555) 123-4567" — the way anyone actually remembers a number.
 */
export function searchContacts(contacts: readonly Contact[], query: string): Contact[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  const digits = q.replace(/\D/g, '');
  return contacts.filter((c) => {
    const haystack = [contactName(c), c.company, c.role, c.email, c.phone, c.notes, ...c.tags]
      .join(' ')
      .toLowerCase();
    if (haystack.includes(q)) return true;
    return digits.length >= 3 && c.phone.replace(/\D/g, '').includes(digits);
  });
}
