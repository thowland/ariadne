import { describe, expect, it } from 'vitest';

import { isoAdd } from './dates';
import {
  atRiskReport,
  atRiskText,
  filterProjects,
  portfolioRollup,
  portfolioText,
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
