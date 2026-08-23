import {
  contactName,
  contactsOfTask,
  directReports,
  managerOf,
  projectContacts,
  projectsOfContact,
  searchContacts,
  tasksOfContact,
} from '@shared/domain/contacts';
import { layoutDepGraph } from '@shared/domain/dep-graph';
import {
  indexTasks,
  isArchived,
  isBlocked,
  isDueThisWeek,
  isDueToday,
  isOpen,
  isOverdue,
  projectsInScope,
} from '@shared/domain/derive';
import type { Scope } from '@shared/domain/derive';
import { estimateTotals, formatEstimate } from '@shared/domain/estimate';
import { searchProjects, searchTasks } from '@shared/domain/search';
import { byProjectListOrder } from '@shared/domain/sort';
import { allKnownTags } from '@shared/domain/tags';
import type { Contact, IsoDate, Project, Task, Workspace } from '@shared/types';

/**
 * What the MCP server can answer (D39). Pure functions over a Workspace, so
 * every one of them is testable without a transport, a filesystem or a clock
 * — `today` is a parameter here exactly as it is in `shared/domain`.
 *
 * The projections are deliberately lean. Everything an assistant is handed
 * costs context, so each shape carries what is needed to answer the question
 * and the ids needed to ask the next one, and nothing else. Notes and file
 * contents are summarised rather than dumped for the same reason.
 */

/** A task as the assistant sees it. */
interface TaskView {
  id: string;
  title: string;
  status: string;
  priority: string;
  project: string;
  due?: IsoDate;
  overdue?: true;
  blocked?: true;
  estimate?: string;
  tags?: string[];
  people?: string[];
}

function taskView(ws: Workspace, task: Task, today: IsoDate, byId: Map<string, Task>): TaskView {
  const project = ws.projects.find((p) => p.id === task.projectId);
  const people = contactsOfTask(ws, task).map(contactName);
  return {
    id: task.id,
    title: task.title === '' ? 'Untitled task' : task.title,
    status: task.status,
    priority: task.priority,
    project: project?.name ?? 'Unknown project',
    ...(task.dueDate !== null ? { due: task.dueDate } : {}),
    ...(isOverdue(task, today) ? { overdue: true as const } : {}),
    ...(isBlocked(task, byId) ? { blocked: true as const } : {}),
    ...(task.estimateHours !== undefined ? { estimate: formatEstimate(task.estimateHours) } : {}),
    ...(task.tags.length > 0 ? { tags: task.tags } : {}),
    ...(people.length > 0 ? { people } : {}),
  };
}

function contactLine(c: Contact): Record<string, string> {
  return {
    id: c.id,
    name: contactName(c),
    ...(c.role !== '' ? { role: c.role } : {}),
    ...(c.company !== '' ? { company: c.company } : {}),
    ...(c.department !== '' ? { department: c.department } : {}),
    ...(c.email !== '' ? { email: c.email } : {}),
    ...(c.phone !== '' ? { phone: c.phone } : {}),
  };
}

// ---------- briefing ----------

/**
 * What the Command Center shows, as data: the same derivations, so the
 * assistant and the screen can never disagree about what is overdue.
 * Archived projects are out of scope here as everywhere (D13).
 */
export function briefing(ws: Workspace, today: IsoDate, scope: Scope = 'all'): unknown {
  const inScope = new Set(projectsInScope(ws.projects, scope).map((p) => p.id));
  const tasks = ws.tasks.filter((t) => inScope.has(t.projectId));
  const byId = indexTasks(ws.tasks);
  const view = (t: Task): TaskView => taskView(ws, t, today, byId);

  const overdue = tasks.filter((t) => isOverdue(t, today)).sort(byProjectListOrder);
  const dueToday = tasks.filter((t) => isDueToday(t, today));
  const dueThisWeek = tasks.filter((t) => isDueThisWeek(t, today));
  const blocked = tasks.filter((t) => isOpen(t) && isBlocked(t, byId));
  const open = tasks.filter(isOpen);

  return {
    today,
    scope,
    counts: {
      open: open.length,
      overdue: overdue.length,
      dueToday: dueToday.length,
      dueThisWeek: dueThisWeek.length,
      blocked: blocked.length,
      projects: inScope.size,
    },
    effortRemaining: formatEstimate(estimateTotals(open).open) || 'none estimated',
    overdue: overdue.map(view),
    dueToday: dueToday.map(view),
    dueThisWeek: dueThisWeek.map(view),
    blocked: blocked.map(view),
  };
}

// ---------- search ----------

/**
 * One query across tasks, projects, contacts and tags — the same matching the
 * app's own search bar uses, so "the varnish thing" resolves the same way for
 * the assistant as it does for the user.
 */
export function search(ws: Workspace, query: string, today: IsoDate, limit = 20): unknown {
  const byId = indexTasks(ws.tasks);
  const q = query.trim().toLowerCase();
  const tasks = searchTasks(ws.tasks, query).slice(0, limit);
  const projects = searchProjects(ws.projects, query).slice(0, limit);
  const contacts = searchContacts(ws.contacts, query).slice(0, limit);
  const tags = q === '' ? [] : allKnownTags(ws).filter((t) => t.toLowerCase().includes(q));

  return {
    query,
    counts: { tasks: tasks.length, projects: projects.length, contacts: contacts.length },
    tasks: tasks.map((t) => taskView(ws, t, today, byId)),
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      ...(isArchived(p) ? { archived: true } : {}),
    })),
    contacts: contacts.map(contactLine),
    tags,
  };
}

// ---------- project detail ----------

/** Resolve a project by id, or by a case-insensitive name match. */
export function findProject(ws: Workspace, needle: string): Project | undefined {
  const q = needle.trim().toLowerCase();
  return (
    ws.projects.find((p) => p.id === needle) ??
    ws.projects.find((p) => p.name.toLowerCase() === q) ??
    ws.projects.find((p) => p.name.toLowerCase().includes(q))
  );
}

export function projectDetail(ws: Workspace, project: Project, today: IsoDate): unknown {
  const byId = indexTasks(ws.tasks);
  const tasks = ws.tasks.filter((t) => t.projectId === project.id).sort(byProjectListOrder);
  const effort = estimateTotals(tasks);
  const graph = layoutDepGraph(tasks);

  return {
    id: project.id,
    name: project.name,
    category: project.category,
    status: project.status,
    ...(isArchived(project) ? { archived: true } : {}),
    ...(project.tags.length > 0 ? { tags: project.tags } : {}),
    ...(project.notes !== '' ? { notes: project.notes } : {}),
    counts: {
      open: tasks.filter(isOpen).length,
      done: tasks.filter((t) => t.status === 'Done').length,
      overdue: tasks.filter((t) => isOverdue(t, today)).length,
    },
    effort: {
      remaining: formatEstimate(effort.open) || 'none estimated',
      total: formatEstimate(effort.total) || 'none estimated',
      unestimatedOpenTasks: effort.unestimated,
    },
    tasks: tasks.map((t) => taskView(ws, t, today, byId)),
    // Only the edges; the geometry is a screen concern.
    dependencies: (graph?.edges ?? []).map((e) => ({ blocks: e.from, blocked: e.to })),
    people: projectContacts(ws, project.id).map((row) => ({
      ...contactLine(row.contact),
      via: row.source,
      openTasksHere: row.openTasks,
    })),
    links: project.links.filter((l) => l.url !== ''),
    files: ws.files
      .filter((f) => f.projectId === project.id)
      .map((f) => ({ name: f.name, kind: f.kind })),
  };
}

// ---------- contact detail ----------

/** Resolve a contact by id, or by name/company, the way the picker does. */
export function findContact(ws: Workspace, needle: string): Contact | undefined {
  const q = needle.trim().toLowerCase();
  return (
    ws.contacts.find((c) => c.id === needle) ??
    ws.contacts.find((c) => contactName(c).toLowerCase() === q) ??
    searchContacts(ws.contacts, needle)[0]
  );
}

export function contactDetail(ws: Workspace, contact: Contact, today: IsoDate): unknown {
  const byId = indexTasks(ws.tasks);
  const tasks = tasksOfContact(ws, contact.id).sort(byProjectListOrder);
  const manager = managerOf(ws, contact);

  return {
    ...contactLine(contact),
    ...(contact.tags.length > 0 ? { tags: contact.tags } : {}),
    ...(contact.notes !== '' ? { notes: contact.notes } : {}),
    reportsTo: manager === undefined ? null : contactLine(manager),
    directReports: directReports(ws, contact.id).map(contactLine),
    projects: projectsOfContact(ws, contact.id).map((p) => ({ id: p.id, name: p.name })),
    counts: {
      open: tasks.filter(isOpen).length,
      done: tasks.filter((t) => t.status === 'Done').length,
      overdue: tasks.filter((t) => isOverdue(t, today)).length,
    },
    tasks: tasks.map((t) => taskView(ws, t, today, byId)),
  };
}

// ---------- workspace info ----------

/** Enough to confirm the server is talking to the workspace you think it is. */
export function workspaceInfo(
  ws: Workspace,
  today: IsoDate,
  dataDir: string,
  via: string,
): unknown {
  return {
    dataDir,
    locatedVia: via,
    today,
    readOnly: true,
    counts: {
      projects: ws.projects.filter((p) => !isArchived(p)).length,
      archivedProjects: ws.projects.filter(isArchived).length,
      tasks: ws.tasks.length,
      contacts: ws.contacts.length,
      files: ws.files.length,
    },
    projects: ws.projects.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      ...(isArchived(p) ? { archived: true } : {}),
    })),
  };
}
