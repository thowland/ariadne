import type { Contact, Workspace } from '../types';

import { contactSortName, directReports, managerOf } from './contacts';
import type { MapPositions, NodeMapLayout, PositionedNode } from './node-map';
import { anchorEdge, mapBounds, pinnedPosition } from './node-map';

/**
 * Org-map layout (D34): one person's immediate neighbourhood, as pure
 * geometry. Deliberately three rows and no more — the manager above, the
 * person in the middle, their direct reports below.
 *
 * Not a company org chart. Rendering a whole hierarchy would be a different
 * screen with different problems (hundreds of boxes, panning, collapsing),
 * and it would answer a question the contact page is not asking. The question
 * here is "where does this person sit", which is exactly one hop each way.
 *
 * Hand-placed positions and the resizable canvas work the same way as the
 * dependency map (D20), through the same `node-map.ts` geometry.
 */

export const ORG_NODE_W = 188;
export const ORG_NODE_H = 60;
const ROW_GAP = 52;
const COL_GAP = 18;
const PAD_L = 8;
const PAD_T = 8;

/** Where a node sits relative to the person the map is about. */
export type OrgRelation = 'manager' | 'self' | 'report';

export interface OrgNode extends PositionedNode {
  contact: Contact;
  relation: OrgRelation;
}

export type OrgChartLayout = NodeMapLayout<OrgNode>;

/**
 * Lays out `contact` with their manager above and their reports below, or
 * null when there is neither — a person with no reporting line either way has
 * no map worth drawing, only an empty box of themself.
 *
 * The centre row is centred over the widest row, so with several reports the
 * person sits above the middle of them rather than off to the left.
 */
export function layoutOrgChart(
  ws: Workspace,
  contact: Contact,
  positions: MapPositions = {},
): OrgChartLayout | null {
  const manager = managerOf(ws, contact);
  const reports = directReports(ws, contact.id).sort((a, b) =>
    contactSortName(a).localeCompare(contactSortName(b)),
  );
  if (manager === undefined && reports.length === 0) return null;

  const rows: { contacts: Contact[]; relation: OrgRelation }[] = [];
  if (manager !== undefined) rows.push({ contacts: [manager], relation: 'manager' });
  rows.push({ contacts: [contact], relation: 'self' });
  if (reports.length > 0) rows.push({ contacts: reports, relation: 'report' });

  const widest = Math.max(...rows.map((r) => r.contacts.length));
  const rowW = widest * (ORG_NODE_W + COL_GAP) - COL_GAP;

  const nodes: OrgNode[] = [];
  rows.forEach((row, rowIndex) => {
    const own = row.contacts.length * (ORG_NODE_W + COL_GAP) - COL_GAP;
    const startX = PAD_L + (rowW - own) / 2;
    row.contacts.forEach((c, i) => {
      const placed = pinnedPosition(positions, c.id);
      nodes.push({
        id: c.id,
        contact: c,
        relation: row.relation,
        x: placed?.x ?? startX + i * (ORG_NODE_W + COL_GAP),
        y: placed?.y ?? PAD_T + rowIndex * (ORG_NODE_H + ROW_GAP),
        pinned: placed !== null,
      });
    });
  });

  const at = (id: string): { x: number; y: number } | undefined => nodes.find((n) => n.id === id);
  const self = at(contact.id);
  const edges = [];
  if (self !== undefined) {
    // Manager → person, then person → each report: the direction the chart
    // is read in, which is also the direction the arrowheads point.
    const above = manager === undefined ? undefined : at(manager.id);
    if (above !== undefined && manager !== undefined) {
      edges.push(
        anchorEdge(above, self, ORG_NODE_W, ORG_NODE_H, { from: manager.id, to: contact.id }),
      );
    }
    for (const r of reports) {
      const below = at(r.id);
      if (below !== undefined) {
        edges.push(anchorEdge(self, below, ORG_NODE_W, ORG_NODE_H, { from: contact.id, to: r.id }));
      }
    }
  }

  return { nodes, edges, ...mapBounds(nodes, ORG_NODE_W, ORG_NODE_H, PAD_L) };
}
