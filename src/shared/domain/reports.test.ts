import { describe, expect, it } from 'vitest';

import { isoAdd } from './dates';
import {
  atRiskReport,
  atRiskText,
  filterProjects,
  portfolioRollup,
  portfolioText,
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
    // Blockers: waiting cutover, blocked auth/billing, overdue auth.
    expect(p1?.blockers.map((t) => t.title).sort()).toEqual([
      'Cutover & DNS switch',
      'Migrate auth service',
      'Migrate billing service',
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
    expect(text).toContain('Blockers: ');
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

  it('flags overdue, blocked, and near-due critical/high with reasons', () => {
    const reasons = new Map(rows.map((r) => [r.task.title, r.reason]));
    expect(reasons.get('Migrate auth service')).toBe('1d overdue');
    expect(reasons.get('Sand to 220 grit')).toBe('2d overdue');
    expect(reasons.get('Gather 1099s and receipts')).toBe('3d overdue');
    expect(reasons.get('Cutover & DNS switch')).toBe('Blocked by dependency');
    // High priority due tomorrow, not blocked: categorize expenses is blocked by x1 → blocked reason wins.
    expect(reasons.get('Categorize expenses')).toBe('Blocked by dependency');
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
