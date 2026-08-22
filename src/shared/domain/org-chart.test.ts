import { describe, expect, it } from 'vitest';

import type { Contact, Workspace } from '../types';
import { emptyWorkspace } from '../types';

import { layoutOrgChart, ORG_NODE_H, ORG_NODE_W } from './org-chart';
import { seedWorkspace } from './seed';

const TODAY = '2026-07-08';

function person(id: string, patch: Partial<Contact> = {}): Contact {
  return {
    id,
    firstName: id.toUpperCase(),
    lastName: 'Person',
    company: '',
    department: '',
    role: '',
    email: '',
    phone: '',
    notes: '',
    tags: [],
    createdAt: TODAY,
    ...patch,
  };
}

function withPeople(...contacts: Contact[]): Workspace {
  return { ...emptyWorkspace(), contacts };
}

/** The contact a layout is about, by id. */
function nodeOf(layout: NonNullable<ReturnType<typeof layoutOrgChart>>, id: string) {
  const node = layout.nodes.find((n) => n.id === id);
  if (node === undefined) throw new Error(`no node ${id}`);
  return node;
}

describe('layoutOrgChart', () => {
  const ws = seedWorkspace(TODAY);
  const rachel = ws.contacts.find((c) => c.id === 'c8');
  const marcus = ws.contacts.find((c) => c.id === 'c2');
  if (rachel === undefined || marcus === undefined) throw new Error('fixture drift');

  it('draws exactly one layer up and one layer down, never the whole company', () => {
    // Marcus reports to Rachel, who has another report (Sofia). Sofia is
    // Marcus's peer, not his neighbour, and must not appear on his map.
    const layout = layoutOrgChart(ws, marcus);
    if (layout === null) throw new Error('expected a layout');
    expect(layout.nodes.map((n) => n.id).sort()).toEqual(['c2', 'c8']);
    expect(nodeOf(layout, 'c8').relation).toBe('manager');
    expect(nodeOf(layout, 'c2').relation).toBe('self');
  });

  it('puts the manager above and the reports below the person', () => {
    const layout = layoutOrgChart(ws, rachel);
    if (layout === null) throw new Error('expected a layout');
    const self = nodeOf(layout, 'c8');
    expect(self.relation).toBe('self');
    for (const id of ['c2', 'c6']) {
      const report = nodeOf(layout, id);
      expect(report.relation).toBe('report');
      expect(report.y).toBeGreaterThan(self.y);
    }

    const below = layoutOrgChart(ws, marcus);
    if (below === null) throw new Error('expected a layout');
    expect(nodeOf(below, 'c8').y).toBeLessThan(nodeOf(below, 'c2').y);
  });

  it('is null when the person has no reporting line either way', () => {
    // A map of one box saying "you" answers nothing.
    const dana = ws.contacts[0];
    if (dana === undefined) throw new Error('fixture drift');
    expect(layoutOrgChart(ws, dana)).toBeNull();
    expect(layoutOrgChart(withPeople(person('a')), person('a'))).toBeNull();
  });

  it('draws a person with only a manager, and a person with only reports', () => {
    const boss = person('boss');
    const only = person('only', { managerId: 'boss' });
    const up = layoutOrgChart(withPeople(boss, only), only);
    expect(up?.nodes.map((n) => n.relation)).toEqual(['manager', 'self']);

    const down = layoutOrgChart(withPeople(boss, only), boss);
    expect(down?.nodes.map((n) => n.relation)).toEqual(['self', 'report']);
  });

  it('centres the person over the widest row', () => {
    const boss = person('boss');
    const reports = ['r1', 'r2', 'r3'].map((id) => person(id, { managerId: 'boss' }));
    const layout = layoutOrgChart(withPeople(boss, ...reports), boss);
    if (layout === null) throw new Error('expected a layout');
    const self = nodeOf(layout, 'boss');
    const rowCentre = (nodeOf(layout, 'r1').x + nodeOf(layout, 'r3').x + ORG_NODE_W) / 2;
    expect(self.x + ORG_NODE_W / 2).toBeCloseTo(rowCentre, 5);
  });

  it('points every edge the way the chart is read: manager → person → report', () => {
    const boss = person('boss', { managerId: 'top' });
    const top = person('top');
    const report = person('r1', { managerId: 'boss' });
    const layout = layoutOrgChart(withPeople(top, boss, report), boss);
    if (layout === null) throw new Error('expected a layout');
    expect(layout.edges).toHaveLength(2);
    const [fromManager, toReport] = layout.edges;
    // Both run downwards, so the arrowheads read top-to-bottom.
    expect(fromManager?.y2).toBeGreaterThan(fromManager?.y1 ?? 0);
    expect(toReport?.y2).toBeGreaterThan(toReport?.y1 ?? 0);
  });

  it('honours hand-placed positions and marks them pinned', () => {
    const layout = layoutOrgChart(ws, marcus, { c8: { x: 480, y: 12 } });
    if (layout === null) throw new Error('expected a layout');
    expect(nodeOf(layout, 'c8')).toMatchObject({ x: 480, y: 12, pinned: true });
    expect(nodeOf(layout, 'c2').pinned).toBe(false);
  });

  it('grows the canvas to hold a node dragged out to the right', () => {
    const tight = layoutOrgChart(ws, marcus);
    const wide = layoutOrgChart(ws, marcus, { c8: { x: 900, y: 400 } });
    expect(wide?.width).toBeGreaterThan(tight?.width ?? 0);
    expect(wide?.height).toBeGreaterThanOrEqual(400 + ORG_NODE_H);
  });

  it('ignores a hand-placed position for somebody not on this map', () => {
    const layout = layoutOrgChart(ws, marcus, { c6: { x: 900, y: 900 } });
    expect(layout?.nodes.map((n) => n.id).sort()).toEqual(['c2', 'c8']);
    expect(layout?.width).toBeLessThan(900);
  });

  it('orders reports by name, so the row does not shuffle between visits', () => {
    const boss = person('boss');
    const reports = [
      person('z', { firstName: 'Zoe', lastName: 'Adams', managerId: 'boss' }),
      person('a', { firstName: 'Aaron', lastName: 'Zeller', managerId: 'boss' }),
    ];
    const layout = layoutOrgChart(withPeople(boss, ...reports), boss);
    // "Adams, Zoe" before "Zeller, Aaron" — surname order, like the list.
    expect(layout?.nodes.filter((n) => n.relation === 'report').map((n) => n.id)).toEqual([
      'z',
      'a',
    ]);
  });

  it('survives a manager link that points at nobody', () => {
    const orphan = person('a', { managerId: 'ghost' });
    expect(layoutOrgChart(withPeople(orphan), orphan)).toBeNull();
  });
});
