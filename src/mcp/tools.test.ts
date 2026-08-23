import { seedWorkspace } from '@shared/domain/seed';
import { describe, expect, it } from 'vitest';

import {
  briefing,
  contactDetail,
  findContact,
  findProject,
  projectDetail,
  search,
  workspaceInfo,
} from './tools';

const TODAY = '2026-07-08';
const ws = seedWorkspace(TODAY);

/**
 * The tools return `unknown` — they are JSON payloads, not domain types. The
 * shapes below are the contract the skill actually relies on, so declaring
 * them here means a change to a projection breaks a test loudly rather than
 * quietly changing what an assistant gets told.
 */
interface TaskRow {
  id: string;
  title: string;
  project: string;
  status: string;
  due?: string;
  overdue?: boolean;
  blocked?: boolean;
  estimate?: string;
  people?: string[];
}
interface Named {
  id: string;
  name: string;
}
interface Briefing {
  today: string;
  scope: string;
  counts: Record<string, number>;
  effortRemaining: string;
  overdue: TaskRow[];
  dueToday: TaskRow[];
  dueThisWeek: TaskRow[];
  blocked: TaskRow[];
}
interface SearchResult {
  counts: Record<string, number>;
  tasks: TaskRow[];
  projects: Named[];
  contacts: { name: string; email?: string; company?: string }[];
  tags: string[];
}
interface ProjectDetail {
  name: string;
  counts: Record<string, number>;
  effort: { remaining: string; total: string; unestimatedOpenTasks: number };
  tasks: TaskRow[];
  dependencies: { blocks: string; blocked: string }[];
  people: (Named & { via: string })[];
  files: { name: string; kind: string }[];
}
interface ContactDetail {
  name: string;
  email?: string;
  reportsTo: Named | null;
  directReports: Named[];
  projects: Named[];
  tasks: TaskRow[];
}
interface WorkspaceInfo {
  dataDir: string;
  readOnly: boolean;
  counts: Record<string, number>;
  projects: Named[];
}

/** Fail loudly if the seed drifts, rather than asserting against undefined. */
function project(name: string) {
  const found = findProject(ws, name);
  if (found === undefined) throw new Error(`fixture drift: no project ${name}`);
  return found;
}
function contact(name: string) {
  const found = findContact(ws, name);
  if (found === undefined) throw new Error(`fixture drift: no contact ${name}`);
  return found;
}

describe('briefing', () => {
  it('reports the same buckets the Command Center shows', () => {
    const b = briefing(ws, TODAY) as Briefing;
    expect(b.counts).toMatchObject({ overdue: 3, dueToday: 2, projects: 6 });
    expect(b.overdue.map((t) => t.title)).toContain('Migrate auth service');
    expect(b.today).toBe(TODAY);
  });

  it('marks why each task is in the list, so nothing has to re-derive it', () => {
    const b = briefing(ws, TODAY) as Briefing;
    expect(b.overdue.every((t) => t.overdue === true)).toBe(true);
    expect(b.blocked.every((t) => t.blocked === true)).toBe(true);
  });

  it('honours the work/home scope, which reports must never leak', () => {
    const projectsIn = (b: Briefing): string[] =>
      [...b.overdue, ...b.dueToday, ...b.dueThisWeek].map((t) => t.project);
    expect(projectsIn(briefing(ws, TODAY, 'work') as Briefing)).not.toContain('2025 Taxes');
    expect(projectsIn(briefing(ws, TODAY, 'home') as Briefing)).not.toContain(
      'Q3 Platform Migration',
    );
  });

  it('carries the effort still to do', () => {
    expect((briefing(ws, TODAY) as Briefing).effortRemaining).toMatch(/\d+[dh]/);
  });

  it('says who is on a task, so it can be handed straight back', () => {
    const b = briefing(ws, TODAY) as Briefing;
    const everyone = [...b.overdue, ...b.dueToday].flatMap((t) => t.people ?? []);
    expect(everyone).toContain('Dana Reyes'); // on the overdue auth migration
    expect(everyone).toContain('Elena Vasquez'); // on the overdue 1099s
  });
});

describe('search', () => {
  it('finds tasks, projects and contacts in one call', () => {
    // Tasks match title/notes/tags; projects only name and tags — so
    // "varnish" finds the task and "boat" finds the project holding it.
    const varnish = search(ws, 'varnish', TODAY) as SearchResult;
    expect(varnish.tasks.map((t) => t.title)).toContain('Apply first coat of spar varnish');
    expect(varnish.projects).toEqual([]);

    const boat = search(ws, 'boat', TODAY) as SearchResult;
    expect(boat.projects.map((p) => p.name)).toContain('Refinish boat table');

    const dana = search(ws, 'dana', TODAY) as SearchResult;
    expect(dana.contacts[0]?.name).toBe('Dana Reyes');
    expect(dana.contacts[0]?.email).toBe('dana.reyes@northwind.example');
  });

  it('matches tags, which is how a vague reference usually resolves', () => {
    expect((search(ws, 'infra', TODAY) as SearchResult).tags).toContain('infra');
  });

  it('returns nothing rather than everything for an empty query', () => {
    const r = search(ws, '   ', TODAY) as SearchResult;
    expect(r.counts).toEqual({ tasks: 0, projects: 0, contacts: 0 });
    expect(r.tags).toEqual([]);
  });
});

describe('project detail', () => {
  it('resolves a project by id, exact name, or partial name', () => {
    expect(findProject(ws, 'p1')?.id).toBe('p1');
    expect(findProject(ws, 'Q3 Platform Migration')?.id).toBe('p1');
    expect(findProject(ws, 'q3 platform')?.id).toBe('p1');
    expect(findProject(ws, 'nothing like this')).toBeUndefined();
  });

  it('gives the tasks, the effort, the people and the dependency edges', () => {
    const p = projectDetail(ws, project('p1'), TODAY) as ProjectDetail;
    expect(p.name).toBe('Q3 Platform Migration');
    expect(p.counts).toMatchObject({ open: 5, done: 1, overdue: 1 });
    expect(p.effort.remaining).toMatch(/\d+d/);
    expect(p.tasks).toHaveLength(6);
    expect(p.dependencies).toContainEqual({ blocks: 't1', blocked: 't2' });
    expect(p.people.map((c) => c.name)).toContain('Aidan Cross');
  });

  it('lists files by name only, never their contents', () => {
    const p = projectDetail(ws, project('p1'), TODAY) as ProjectDetail;
    expect(p.files[0]).toEqual({ name: 'Migration overview.md', kind: 'markdown' });
    expect(JSON.stringify(p.files)).not.toContain('Zero-downtime');
  });
});

describe('contact detail', () => {
  it('resolves by id, exact name, or a loose match', () => {
    expect(findContact(ws, 'c1')?.id).toBe('c1');
    expect(findContact(ws, 'Dana Reyes')?.id).toBe('c1');
    expect(findContact(ws, 'northwind')?.company).toBe('Northwind Systems');
    expect(findContact(ws, 'nobody at all')).toBeUndefined();
  });

  it('answers "what have I asked them for", with the reporting line', () => {
    const marcus = contactDetail(ws, contact('Marcus Bell'), TODAY) as ContactDetail;
    expect(marcus.reportsTo?.name).toBe('Rachel Okonjo');
    expect(marcus.directReports).toEqual([]);
    expect(marcus.tasks.length).toBeGreaterThan(0);
    expect(marcus.projects.map((p) => p.name)).toContain('Q3 Platform Migration');
  });

  it('reads the org chart from the other end too', () => {
    const rachel = contactDetail(ws, contact('Rachel Okonjo'), TODAY) as ContactDetail;
    expect(rachel.reportsTo).toBeNull();
    expect(rachel.directReports.map((c) => c.name)).toEqual(['Marcus Bell', 'Sofia Grant']);
  });
});

describe('workspace info', () => {
  it('says where it is reading from and that it cannot write', () => {
    const info = workspaceInfo(ws, TODAY, '/tmp/data', 'config') as WorkspaceInfo;
    expect(info).toMatchObject({ dataDir: '/tmp/data', locatedVia: 'config', readOnly: true });
    expect(info.counts.projects).toBe(6);
    expect(info.projects.map((p) => p.name)).toContain('2025 Taxes');
  });
});

describe('every payload', () => {
  it('is plain JSON, because it has to cross a JSON-RPC boundary', () => {
    // An undefined, a Date or a Map would pass every test above and then
    // silently vanish on the wire.
    for (const payload of [
      briefing(ws, TODAY),
      search(ws, 'dana', TODAY),
      projectDetail(ws, project('p1'), TODAY),
      contactDetail(ws, contact('c1'), TODAY),
      workspaceInfo(ws, TODAY, '/tmp/data', 'env'),
    ]) {
      expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
    }
  });
});
