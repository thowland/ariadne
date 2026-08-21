import { describe, expect, it } from 'vitest';

import { isoAdd } from './dates';
import {
  atRiskReport,
  atRiskText,
  contactActivity,
  contactActivityText,
  deferredReport,
  deferredText,
  filterProjects,
  portfolioCsvRows,
  portfolioProgress,
  portfolioRollup,
  portfolioText,
  sortPortfolio,
  retroBuckets,
  retroPresetRange,
  retrospective,
  retrospectiveText,
  weeklyStatus,
  weeklyStatusText,
} from './reports';
import { seedWorkspace } from './seed';

const TODAY = '2026-07-08';
const ws = seedWorkspace(TODAY);

describe('filterProjects', () => {
  it('scopes by category and tag; work never leaks home projects', () => {
    expect(filterProjects(ws.projects, 'all')).toHaveLength(6);
    const work = filterProjects(ws.projects, 'work');
    expect(work.map((p) => p.id)).toEqual(['p1', 'p2', 'p5']);
    expect(work.every((p) => p.category === 'work')).toBe(true);
    const home = filterProjects(ws.projects, 'home');
    expect(home.map((p) => p.id)).toEqual(['p3', 'p4', 'p6']);
    expect(filterProjects(ws.projects, 'tag:infra').map((p) => p.id)).toEqual(['p1']);
    expect(filterProjects(ws.projects, 'tag:nonexistent')).toEqual([]);
  });

  it('archived projects never report, under any filter', () => {
    const projects = ws.projects.map((p) => (p.id === 'p1' ? { ...p, archived: true } : p));
    expect(filterProjects(projects, 'all').some((p) => p.id === 'p1')).toBe(false);
    expect(filterProjects(projects, 'work').some((p) => p.id === 'p1')).toBe(false);
    expect(filterProjects(projects, 'tag:infra')).toEqual([]);
    // And through a report builder: p1's blocks disappear from weekly status.
    const archivedWs = { ...ws, projects };
    expect(weeklyStatus(archivedWs, 'all', TODAY).some((b) => b.project.id === 'p1')).toBe(false);
  });

  it('includes archived projects when asked (the retrospective case)', () => {
    const projects = ws.projects.map((p) => (p.id === 'p1' ? { ...p, archived: true } : p));
    const opts = { includeArchived: true };
    expect(filterProjects(projects, 'all', opts).some((p) => p.id === 'p1')).toBe(true);
    expect(filterProjects(projects, 'work', opts).some((p) => p.id === 'p1')).toBe(true);
    expect(filterProjects(projects, 'tag:infra', opts).map((p) => p.id)).toEqual(['p1']);
    // Scoping still holds: an archived work project stays out of the home report.
    expect(filterProjects(projects, 'home', opts).some((p) => p.id === 'p1')).toBe(false);
  });
});

describe('weeklyStatus', () => {
  const blocks = weeklyStatus(ws, 'all', TODAY);

  it('collects done-this-week, planned-next, and blockers per project', () => {
    const p1 = blocks.find((b) => b.project.id === 'p1');
    expect(p1).toBeDefined();
    // Nothing completed within 7 days in p1 (audit done 14d ago).
    expect(p1?.done).toEqual([]);
    // Planned: due 0..7d → cluster (+2), runbook (0).
    expect(p1?.planned.map((t) => t.title).sort()).toEqual([
      'Provision new k8s cluster',
      'Write migration runbook',
    ]);
    // At risk: overdue auth, plus cutover which directly depends on it.
    // Billing depends only on the (not overdue) cluster task; Waiting status
    // alone is not a risk.
    expect(p1?.atRisk.map((t) => t.title).sort()).toEqual([
      'Cutover & DNS switch',
      'Migrate auth service',
    ]);
  });

  it('honors the scope filter (home-only excludes work blocks)', () => {
    const home = weeklyStatus(ws, 'home', TODAY);
    expect(home.every((b) => b.project.category === 'home')).toBe(true);
    expect(home.some((b) => b.project.id === 'p1')).toBe(false);
  });

  it('finds completions inside the window', () => {
    const p3 = blocks.find((b) => b.project.id === 'p3');
    expect(p3?.done.map((t) => t.title)).toEqual(['Strip old varnish']); // completed 5d ago
  });

  it('serializes to the prototype text shape', () => {
    const text = weeklyStatusText(blocks, TODAY);
    expect(text).toContain('WEEKLY STATUS — Wednesday, July 8, 2026');
    expect(text).toContain('## Q3 Platform Migration');
    expect(text).toContain('Done this week: —');
    expect(text).toContain('At risk: Migrate auth service; Cutover & DNS switch');
  });
});

describe('portfolioRollup', () => {
  it('counts open/done/overdue and finds next due per project', () => {
    const rows = portfolioRollup(ws, 'all', TODAY);
    const p1 = rows.find((r) => r.project.id === 'p1');
    expect(p1).toMatchObject({ open: 5, done: 1, overdue: 1 });
    expect(p1?.next?.title).toBe('Migrate auth service');

    const p6 = rows.find((r) => r.project.id === 'p6');
    expect(p6).toMatchObject({ open: 2, done: 1, overdue: 0 });
  });

  it('serializes with overdue counts only when present', () => {
    const text = portfolioText(portfolioRollup(ws, 'all', TODAY), TODAY);
    expect(text).toContain('- Q3 Platform Migration [work]: 5 open, 1 done, 1 overdue');
    expect(text).toContain('- Home network upgrade [home]: 2 open, 1 done\n');
  });
});

describe('sortPortfolio', () => {
  const rows = portfolioRollup(ws, 'all', TODAY);
  const names = (list: ReturnType<typeof portfolioRollup>): string[] =>
    list.map((r) => r.project.name);

  it('sorts by name in both directions without mutating the input', () => {
    const before = names(rows);
    const asc = names(sortPortfolio(rows, 'project', 'asc'));
    const desc = names(sortPortfolio(rows, 'project', 'desc'));
    expect(asc).toEqual([...asc].sort((a, b) => a.localeCompare(b)));
    expect(desc).toEqual([...asc].reverse());
    expect(names(rows)).toEqual(before);
  });

  it('orders numeric columns by value', () => {
    const byOverdue = sortPortfolio(rows, 'overdue', 'desc').map((r) => r.overdue);
    expect(byOverdue).toEqual([...byOverdue].sort((a, b) => b - a));
    const byOpen = sortPortfolio(rows, 'open', 'asc').map((r) => r.open);
    expect(byOpen).toEqual([...byOpen].sort((a, b) => a - b));
  });

  it('sorts progress by ratio, not by raw done count', () => {
    const pct = sortPortfolio(rows, 'progress', 'desc').map(portfolioProgress);
    expect(pct).toEqual([...pct].sort((a, b) => b - a));
  });

  it('sinks projects with no next due date in both directions', () => {
    // Every seeded project has something scheduled, so clear one project's
    // dates to produce the "nothing due" case this rule is about.
    const stripped = {
      ...ws,
      tasks: ws.tasks.map((t) => (t.projectId === 'p6' ? { ...t, dueDate: null } : t)),
    };
    const mixed = portfolioRollup(stripped, 'all', TODAY);
    const noNext = mixed.filter((r) => r.next === null).map((r) => r.project.name);
    expect(noNext).toEqual(['Home network upgrade']);

    for (const dir of ['asc', 'desc'] as const) {
      const sorted = names(sortPortfolio(mixed, 'next', dir));
      expect(sorted[sorted.length - 1]).toBe('Home network upgrade');
    }
  });

  it('breaks ties on project name so a coarse column gives a stable order', () => {
    // Category has only two values across the seed, so most rows tie.
    const first = names(sortPortfolio(rows, 'category', 'asc'));
    const second = names(sortPortfolio([...rows].reverse(), 'category', 'asc'));
    expect(first).toEqual(second);
  });
});

describe('portfolioCsvRows', () => {
  it('leads with a header and one row per project', () => {
    const rows = portfolioCsvRows(portfolioRollup(ws, 'all', TODAY));
    expect(rows[0]).toEqual([
      'Project',
      'Type',
      'Progress %',
      'Open',
      'Done',
      'Overdue',
      'Next due',
    ]);
    expect(rows).toHaveLength(portfolioRollup(ws, 'all', TODAY).length + 1);
  });

  it('writes the raw ISO next-due date, not a relative label', () => {
    const rows = portfolioCsvRows(portfolioRollup(ws, 'all', TODAY));
    const p1 = rows.find((r) => r[0] === 'Q3 Platform Migration');
    expect(p1?.[6]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(p1?.[2]).toBe('17'); // 1 done of 6
  });

  it('leaves the next-due cell empty when nothing is scheduled', () => {
    const stripped = {
      ...ws,
      tasks: ws.tasks.map((t) => (t.projectId === 'p6' ? { ...t, dueDate: null } : t)),
    };
    const rows = portfolioCsvRows(portfolioRollup(stripped, 'all', TODAY));
    const p6 = rows.find((r) => r[0] === 'Home network upgrade');
    expect(p6?.[6]).toBe('');
    // Other projects still carry theirs — the blank is specific, not global.
    expect(rows.find((r) => r[0] === 'Q3 Platform Migration')?.[6]).not.toBe('');
  });
});

describe('retrospective', () => {
  it('groups completions in range, newest first', () => {
    const result = retrospective(ws, 'all', isoAdd(TODAY, -30), TODAY);
    expect(result.total).toBe(6); // all seeded Done tasks completed within 30d? audit(-14), interviews(-20), synth(-9), varnish(-5), job(-24), router(-8)
    const first = result.groups[0];
    expect(first?.tasks[0]?.title).toBe('Strip old varnish'); // most recent completion (-5)
  });

  it('respects the date range and filter', () => {
    const narrow = retrospective(ws, 'all', isoAdd(TODAY, -6), TODAY);
    expect(narrow.total).toBe(1);
    expect(narrow.groups[0]?.project.id).toBe('p3');

    const workOnly = retrospective(ws, 'work', isoAdd(TODAY, -30), TODAY);
    expect(workOnly.groups.every((g) => g.project.category === 'work')).toBe(true);
  });

  it('still counts completions from archived projects (D19)', () => {
    const projects = ws.projects.map((p) => (p.id === 'p1' ? { ...p, archived: true } : p));
    const archivedWs = { ...ws, projects };
    const from = isoAdd(TODAY, -30);
    const before = retrospective(ws, 'all', from, TODAY);
    const after = retrospective(archivedWs, 'all', from, TODAY);
    expect(after.total).toBe(before.total);
    expect(after.groups.some((g) => g.project.id === 'p1')).toBe(true);
    // Every other report keeps parking it.
    expect(weeklyStatus(archivedWs, 'all', TODAY).some((b) => b.project.id === 'p1')).toBe(false);
    expect(portfolioRollup(archivedWs, 'all', TODAY).some((r) => r.project.id === 'p1')).toBe(
      false,
    );
    expect(atRiskReport(archivedWs, 'all', TODAY).some((r) => r.project.id === 'p1')).toBe(false);
  });

  it('serializes with dates and project names', () => {
    const text = retrospectiveText(
      retrospective(ws, 'all', isoAdd(TODAY, -6), TODAY),
      isoAdd(TODAY, -6),
      TODAY,
    );
    expect(text).toContain('1 tasks completed');
    expect(text).toContain('Refinish boat table: Strip old varnish');
  });
});

describe('atRiskReport', () => {
  const rows = atRiskReport(ws, 'all', TODAY);

  it('flags overdue tasks and direct dependents of overdue tasks, nothing else', () => {
    const reasons = new Map(rows.map((r) => [r.task.title, r.reason]));
    // Overdue in the seed.
    expect(reasons.get('Migrate auth service')).toBe('1d overdue');
    expect(reasons.get('Sand to 220 grit')).toBe('2d overdue');
    expect(reasons.get('Gather 1099s and receipts')).toBe('3d overdue');
    // Direct dependents of an overdue task, naming the culprit.
    expect(reasons.get('Cutover & DNS switch')).toBe('Waiting on overdue: Migrate auth service');
    expect(reasons.get('Categorize expenses')).toBe(
      'Waiting on overdue: Gather 1099s and receipts',
    );
    expect(reasons.get('Apply first coat of spar varnish')).toBe(
      'Waiting on overdue: Sand to 220 grit',
    );
    // Ordinary dependencies, Waiting status, and near-due priorities are NOT risks.
    expect(reasons.has('Migrate billing service')).toBe(false); // depends on non-overdue cluster
    expect(reasons.has('Meet with accountant')).toBe(false); // Critical, due +4d, dep not overdue
    expect(reasons.has('Second coat + light sand')).toBe(false); // transitive only
    expect(reasons.has('Eng scoping & estimates')).toBe(false); // Waiting, no deps
    expect(rows).toHaveLength(6);
  });

  it('sorts by due date and never includes closed tasks', () => {
    expect(rows.some((r) => r.task.status === 'Done' || r.task.status === 'Dropped')).toBe(false);
    const dues = rows.map((r) => r.task.dueDate ?? '9999-99-99');
    expect([...dues].sort()).toEqual(dues);
  });

  it('scope filtering keeps work rows out of home reports', () => {
    const home = atRiskReport(ws, 'home', TODAY);
    expect(home.every((r) => r.project.category === 'home')).toBe(true);
  });

  it('serializes rows', () => {
    const text = atRiskText(rows, TODAY);
    expect(text).toContain('AT-RISK — Wednesday, July 8, 2026');
    expect(text).toContain('- Q3 Platform Migration: Migrate auth service (1d overdue)');
  });
});

describe('retroPresetRange', () => {
  it('resolves each preset against a pinned Wednesday', () => {
    // TODAY = Wed 2026-07-08; weeks run Sun–Sat.
    expect(retroPresetRange('last-week', TODAY)).toEqual({
      from: '2026-06-28',
      to: '2026-07-04',
    });
    expect(retroPresetRange('last-month', TODAY)).toEqual({
      from: '2026-06-01',
      to: '2026-06-30',
    });
    expect(retroPresetRange('month-to-date', TODAY)).toEqual({
      from: '2026-07-01',
      to: TODAY,
    });
    expect(retroPresetRange('year-to-date', TODAY)).toEqual({
      from: '2026-01-01',
      to: TODAY,
    });
    expect(retroPresetRange('last-30', TODAY)).toEqual({ from: '2026-06-08', to: TODAY });
  });

  it('last-month lands on real month lengths across the year edge', () => {
    expect(retroPresetRange('last-month', '2026-01-15')).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
    expect(retroPresetRange('last-month', '2026-03-05')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
  });
});

describe('retroBuckets', () => {
  it('buckets daily for ranges up to a month, keeping zero days', () => {
    const result = retrospective(ws, 'all', '2026-07-01', TODAY);
    const buckets = retroBuckets(result, '2026-07-01', TODAY);
    expect(buckets).toHaveLength(8);
    expect(buckets.every((b) => b.start === b.end)).toBe(true);
    const total = buckets.reduce((n, b) => n + b.count, 0);
    expect(total).toBe(result.total);
    // "Strip old varnish" completed Jul 3 → that day's bucket counts it.
    expect(buckets.find((b) => b.start === '2026-07-03')?.count).toBeGreaterThan(0);
  });

  it('buckets by Sun–Sat week for longer ranges, clamped to the range', () => {
    const from = '2026-05-01';
    const result = retrospective(ws, 'all', from, TODAY);
    const buckets = retroBuckets(result, from, TODAY);
    expect(buckets.length).toBeGreaterThan(4);
    // First bucket starts at the range start, ends on that week's Saturday.
    expect(buckets[0]).toMatchObject({ start: from, end: '2026-05-02' });
    // Interior buckets are whole Sun–Sat weeks; the last clamps to `to`.
    expect(buckets[1]).toMatchObject({ start: '2026-05-03', end: '2026-05-09' });
    expect(buckets[buckets.length - 1]?.end).toBe(TODAY);
    expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(result.total);
  });

  it('returns nothing for invalid or inverted ranges (mid-edit date inputs)', () => {
    const result = retrospective(ws, 'all', '2026-07-01', TODAY);
    expect(retroBuckets(result, '', TODAY)).toEqual([]);
    expect(retroBuckets(result, TODAY, '2026-07-01')).toEqual([]);
  });
});

describe('deferredReport (D23)', () => {
  // The demo seed carries its own deferral history so the report is never
  // empty in the app (asserted in seed.test.ts). These tests exercise the
  // function against histories they construct themselves, so they start from
  // a workspace with none.
  const seeded = seedWorkspace(TODAY);
  const base = {
    ...seeded,
    tasks: seeded.tasks.map((t) => ({ ...t, deferrals: [] })),
  };

  /** Attach a deferral history to a seeded task, keeping everything else. */
  function withDeferrals(
    entries: { taskId: string; count: number; days: number; dueDate?: string | null }[],
  ) {
    return {
      ...base,
      tasks: base.tasks.map((t) => {
        const entry = entries.find((e) => e.taskId === t.id);
        if (entry === undefined) return t;
        let from = '2026-06-01';
        const deferrals = Array.from({ length: entry.count }, (_, i) => {
          const to = isoAdd(from, entry.days);
          const record = { from, to, on: isoAdd('2026-06-02', i) };
          from = to;
          return record;
        });
        return {
          ...t,
          deferrals,
          dueDate: entry.dueDate === undefined ? from : entry.dueDate,
        };
      }),
    };
  }

  it('reports nothing when no task has ever been deferred', () => {
    const result = deferredReport(base, 'all', 2, TODAY);
    expect(result.rows).toEqual([]);
    expect(result.analytics.tasksEverDeferred).toBe(0);
    expect(result.analytics.totalDeferrals).toBe(0);
  });

  it('lists only tasks at or over the threshold, worst first', () => {
    const ws2 = withDeferrals([
      { taskId: 't1', count: 5, days: 2 },
      { taskId: 't2', count: 3, days: 1 },
      { taskId: 't3', count: 1, days: 4 },
    ]);
    const result = deferredReport(ws2, 'all', 3, TODAY);
    expect(result.rows.map((r) => r.task.id)).toEqual(['t1', 't2']);
    expect(result.rows[0]?.count).toBe(5);
    // Every deferred task still feeds the analytics, threshold or not.
    expect(result.analytics.tasksEverDeferred).toBe(3);
    expect(result.analytics.tasksOverThreshold).toBe(2);
    expect(result.analytics.totalDeferrals).toBe(9);
  });

  it('changing the threshold moves rows but not the headline analytics', () => {
    const ws2 = withDeferrals([
      { taskId: 't1', count: 5, days: 2 },
      { taskId: 't2', count: 2, days: 1 },
    ]);
    const low = deferredReport(ws2, 'all', 2, TODAY);
    const high = deferredReport(ws2, 'all', 5, TODAY);
    expect(low.rows).toHaveLength(2);
    expect(high.rows).toHaveLength(1);
    expect(low.analytics.totalDeferrals).toBe(high.analytics.totalDeferrals);
    expect(low.analytics.totalDaysSlipped).toBe(high.analytics.totalDaysSlipped);
  });

  it('totals the days each push-out added, and averages them', () => {
    const ws2 = withDeferrals([{ taskId: 't1', count: 3, days: 4 }]);
    const result = deferredReport(ws2, 'all', 1, TODAY);
    expect(result.rows[0]?.totalDays).toBe(12);
    expect(result.rows[0]?.slipDays).toBe(12);
    expect(result.analytics.totalDaysSlipped).toBe(12);
    expect(result.analytics.avgDaysPerDeferral).toBe(4);
    expect(result.analytics.medianDeferrals).toBe(3);
  });

  it('flags rows that are still open and already overdue', () => {
    // t2 is open in the seed; t1 is already Done and so can never be overdue.
    const overdue = withDeferrals([{ taskId: 't2', count: 2, days: 1, dueDate: '2026-07-01' }]);
    expect(deferredReport(overdue, 'all', 1, TODAY).analytics.chronicOverdue).toBe(1);
    const future = withDeferrals([{ taskId: 't2', count: 2, days: 1, dueDate: '2026-08-01' }]);
    expect(deferredReport(future, 'all', 1, TODAY).analytics.chronicOverdue).toBe(0);
  });

  it('counts deferred tasks that eventually completed, and drops dropped ones', () => {
    const ws2 = withDeferrals([{ taskId: 't1', count: 2, days: 1 }]);
    const done = {
      ...ws2,
      tasks: ws2.tasks.map((t) =>
        t.id === 't1' ? { ...t, status: 'Done' as const, completedAt: TODAY } : t,
      ),
    };
    expect(deferredReport(done, 'all', 1, TODAY).analytics.completedAnyway).toBe(1);

    const dropped = {
      ...ws2,
      tasks: ws2.tasks.map((t) =>
        t.id === 't1' ? { ...t, status: 'Dropped' as const, completedAt: null } : t,
      ),
    };
    expect(deferredReport(dropped, 'all', 1, TODAY).analytics.tasksEverDeferred).toBe(0);
  });

  it('never leaks out-of-scope or archived projects', () => {
    const ws2 = withDeferrals([{ taskId: 't1', count: 3, days: 1 }]);
    const t1 = ws2.tasks.find((t) => t.id === 't1');
    const owner = ws2.projects.find((p) => p.id === t1?.projectId);
    expect(owner?.category).toBe('work');
    expect(deferredReport(ws2, 'home', 1, TODAY).rows).toEqual([]);
    expect(deferredReport(ws2, 'work', 1, TODAY).rows).toHaveLength(1);

    const archived = {
      ...ws2,
      projects: ws2.projects.map((p) => (p.id === owner?.id ? { ...p, archived: true } : p)),
    };
    expect(deferredReport(archived, 'all', 1, TODAY).rows).toEqual([]);
  });

  it('breaks the churn down by project and priority', () => {
    const ws2 = withDeferrals([
      { taskId: 't1', count: 3, days: 2 },
      { taskId: 't2', count: 2, days: 2 },
    ]);
    const a = deferredReport(ws2, 'all', 1, TODAY).analytics;
    expect(a.byProject[0]?.deferrals).toBeGreaterThanOrEqual(a.byProject[1]?.deferrals ?? 0);
    expect(a.byProject.reduce((n, p) => n + p.deferrals, 0)).toBe(5);
    expect(a.byPriority.reduce((n, p) => n + p.deferrals, 0)).toBe(5);
    // Priorities with no deferrals are omitted rather than shown as zero rows.
    expect(a.byPriority.every((p) => p.deferrals > 0)).toBe(true);
  });

  it('serializes to plain text with the threshold, totals, and rows', () => {
    const ws2 = withDeferrals([{ taskId: 't1', count: 4, days: 3 }]);
    const result = deferredReport(ws2, 'all', 2, TODAY);
    const text = deferredText(result, TODAY);
    expect(text).toContain('REPEATEDLY DEFERRED');
    expect(text).toContain('Threshold: 2+ reschedules');
    expect(text).toContain('4× deferred');
    expect(text).toContain('+12d');
    expect(text).toContain('By project:');
  });
});

describe('contactActivity (D31)', () => {
  // The seed's dates hang off TODAY, so a wide window catches everything.
  const FROM = isoAdd(TODAY, -60);
  const TO = isoAdd(TODAY, 60);

  it('ranks by how many of their tasks fall in the window', () => {
    const { rows } = contactActivity(ws, 'all', FROM, TO, TODAY);
    const totals = rows.map((r) => r.total);
    expect([...totals].sort((a, b) => b - a)).toEqual(totals);
    expect(rows[0]?.total).toBeGreaterThan(0);
  });

  it('splits each person’s window into open, done and overdue', () => {
    const { rows } = contactActivity(ws, 'all', FROM, TO, TODAY);
    const dana = rows.find((r) => r.contact.id === 'c1');
    expect(dana).toMatchObject({ total: 3, open: 2, done: 1, overdue: 1 });
    expect(dana?.projects.map((p) => p.id)).toEqual(['p1']);
    expect(dana?.daysSinceLast).not.toBeNull();
  });

  it('never leaks across the work/home scope', () => {
    const work = contactActivity(ws, 'work', FROM, TO, TODAY).rows.map((r) => r.contact.id);
    // c4 (accountant) and c5 (varnish shop) only touch home projects.
    expect(work).not.toContain('c4');
    expect(work).not.toContain('c5');
    const home = contactActivity(ws, 'home', FROM, TO, TODAY).rows.map((r) => r.contact.id);
    expect(home).toEqual(expect.arrayContaining(['c4', 'c5']));
    expect(home).not.toContain('c1');
  });

  it('keeps a stakeholder with no tasks, on a total of zero', () => {
    const rows = contactActivity(ws, 'all', FROM, TO, TODAY).rows;
    const aidan = rows.find((r) => r.contact.id === 'c7');
    expect(aidan).toMatchObject({ total: 0, open: 0, done: 0, lastActivity: null });
    expect(aidan?.daysSinceLast).toBeNull();
    expect(aidan?.projects.map((p) => p.id)).toEqual(['p1']);
    // Zero activity sorts last, not first.
    expect(rows[rows.length - 1]?.contact.id).toBe('c7');
  });

  it('honours the window: a range with no activity in it empties the report', () => {
    const far = isoAdd(TODAY, 400);
    const { rows, analytics } = contactActivity(ws, 'all', far, isoAdd(far, 7), TODAY);
    // Only the directly attached stakeholders survive; nobody has a task there.
    expect(rows.every((r) => r.total === 0)).toBe(true);
    expect(analytics.collaborativeTasks).toBe(0);
    expect(analytics.windowTasks).toBe(0);
  });

  it('counts a task completed in the window even when it was created before it', () => {
    // "Audit legacy service dependencies" completed 14 days ago.
    const from = isoAdd(TODAY, -15);
    const dana = contactActivity(ws, 'all', from, TODAY, TODAY).rows.find(
      (r) => r.contact.id === 'c1',
    );
    expect(dana?.done).toBe(1);
  });

  it('summarizes people, organizations and how much work is shared', () => {
    const { analytics } = contactActivity(ws, 'all', FROM, TO, TODAY);
    expect(analytics.people).toBe(7);
    // Northwind, Vasquez & Co, Harborline — colleagues have no company.
    expect(analytics.companies).toBe(3);
    expect(analytics.collaborativeTasks).toBeLessThan(analytics.windowTasks);
    expect(analytics.peopleWithOpenWork).toBeGreaterThan(0);
    expect(analytics.byCompany[0]?.company).toBe('Northwind Systems');
    expect(analytics.byCompany[0]?.people).toBe(2);
    // Sorted by task volume.
    const tasks = analytics.byCompany.map((c) => c.tasks);
    expect([...tasks].sort((a, b) => b - a)).toEqual(tasks);
  });

  it('serializes to plain text with the range, the roster, and how to reach them', () => {
    const text = contactActivityText(contactActivity(ws, 'all', FROM, TO, TODAY), FROM, TO);
    expect(text).toContain('CONTACT ACTIVITY');
    expect(text).toContain('Dana Reyes (Northwind Systems)');
    expect(text).toContain('dana.reyes@northwind.example');
    expect(text).toContain('By organization:');
  });
});
