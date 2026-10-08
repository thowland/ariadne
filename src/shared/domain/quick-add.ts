import type { Contact, IsoDate, ThemeChoice, Workspace } from '../types';

import { maskMentions, splitTypedName } from './contacts';
import { isArchived } from './derive';
import { createContact, createTask } from './mutate';
import type { CreatedResult, MutationCtx, MutationResult } from './mutate';
import { findNlDate, stripNlDate } from './nl-date';
import { allKnownTags, maskHashtags, stripHashtags } from './tags';

/**
 * The quick-add pipeline (D29, D31, D35, D40) as pure functions, shared by
 * the project screen's quick-add box and the menu-bar flyout (D51), so the
 * two cannot drift into reading the same typed line two different ways.
 */

/**
 * Somebody @-mentioned into a task that does not exist yet. An existing
 * contact carries their id; a person named for the first time carries only
 * their name, and is not written to the address book until the task is
 * actually created — a name typed, mis-typed, or thought better of before
 * pressing Enter should leave nothing behind.
 */
export interface QuickAddPerson {
  contactId: string | null;
  name: string;
}

/** A composed task, ready to create. Plain data, so it can cross IPC. */
export interface QuickAddDraft {
  projectId: string;
  title: string;
  dueDate: IsoDate | null;
  tags: string[];
  people: QuickAddPerson[];
}

/**
 * Takes the typed line apart: the date phrase and the picked #tags come out
 * of the title as the task is created (D35, D40), because each has its own
 * stored field and a copy left in the text would only contradict it the first
 * time one of them changed. `dismissed` is the user having clicked the date
 * highlight off. Returns null when nothing is left to call the task.
 */
export function finishQuickAdd(
  typed: string,
  { today, dismissed, tags }: { today: IsoDate; dismissed: boolean; tags: readonly string[] },
): { title: string; dueDate: IsoDate | null } | null {
  // maskMentions for the same reason the field does when it highlights
  // (D31 × D29): "@Tom Whitaker" is a colleague, and "tom" is an
  // abbreviation for tomorrow. The masks preserve offsets, so the match
  // still indexes into the real title for stripping.
  const found = dismissed ? null : findNlDate(maskHashtags(maskMentions(typed)), today);
  // The date comes out first: its offsets index into the title as it stands,
  // and taking a #tag out from under them would invalidate the match.
  const dated = found === null ? typed : stripNlDate(typed, found);
  const title = stripHashtags(dated, tags).trim();
  if (title === '') return null;
  return { title, dueDate: found?.date ?? null };
}

/**
 * Creates the task, and — only now, at the moment the task they were named
 * on is committed — any provisional people. A draft aimed at a project that
 * no longer exists or is archived (the flyout's list can be a moment stale)
 * creates nothing.
 */
export function commitQuickAdd(
  ws: Workspace,
  ctx: MutationCtx,
  draft: QuickAddDraft,
): CreatedResult | MutationResult {
  const project = ws.projects.find((p) => p.id === draft.projectId);
  const title = draft.title.trim();
  if (project === undefined || isArchived(project) || title === '') {
    return { workspace: ws, changed: [] };
  }
  let next = ws;
  const changed = new Set<CreatedResult['changed'][number]>();
  const contactIds: string[] = [];
  for (const person of draft.people) {
    if (person.contactId !== null) {
      // A contact deleted while the draft was open is simply left off.
      if (next.contacts.some((c) => c.id === person.contactId)) contactIds.push(person.contactId);
      continue;
    }
    const created = createContact(next, ctx, splitTypedName(person.name));
    next = created.workspace;
    created.changed.forEach((c) => changed.add(c));
    contactIds.push(created.id);
  }
  const task = createTask(next, ctx, project.id, {
    title,
    dueDate: draft.dueDate,
    ...(contactIds.length > 0 ? { contactIds: [...new Set(contactIds)] } : {}),
    ...(draft.tags.length > 0 ? { tags: draft.tags } : {}),
  });
  task.changed.forEach((c) => changed.add(c));
  return { workspace: task.workspace, changed: [...changed], id: task.id };
}

/**
 * What the menu-bar flyout needs to compose a task (D51): the projects it may
 * file into, the people and tags it may complete, and the theme to paint
 * with. The main window builds it, since its memory is the workspace; the
 * flyout never reads the data directory itself.
 */
export interface QuickAddContext {
  projects: { id: string; name: string; color: string }[];
  contacts: Contact[];
  tags: string[];
  theme: ThemeChoice;
}

/** Active projects in sidebar order — the same list the sidebar shows. */
export function quickAddContext(ws: Workspace): QuickAddContext {
  return {
    projects: ws.projects
      .filter((p) => !isArchived(p))
      .map((p) => ({ id: p.id, name: p.name, color: p.color })),
    contacts: ws.contacts,
    tags: allKnownTags(ws),
    theme: ws.settings.theme,
  };
}

/**
 * The project the flyout opens on: the one last used if it is still on the
 * list, otherwise the first.
 */
export function defaultQuickAddProject(
  ctx: QuickAddContext,
  lastProjectId: string | null,
): string | null {
  if (lastProjectId !== null && ctx.projects.some((p) => p.id === lastProjectId)) {
    return lastProjectId;
  }
  return ctx.projects[0]?.id ?? null;
}
