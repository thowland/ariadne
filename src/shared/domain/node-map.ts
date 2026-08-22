/**
 * Geometry shared by the box-and-line maps (D20 dependency map, D34 org map).
 *
 * The two maps differ in what they lay out and what a box says; they do not
 * differ in how an edge finds the side of a box or how a hand-placed node
 * extends the canvas. That part lives here so the second map cannot quietly
 * drift from the first.
 */

/** Hand-placed node positions, keyed by entity id. */
export type MapPositions = Readonly<Record<string, { x: number; y: number }>>;

export interface MapEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Which axis the line leaves and enters on — drives the curve's bend. */
  axis: 'v' | 'h';
  /** The node the line runs from, and the one it points at. */
  from: string;
  to: string;
}

export interface PositionedNode {
  id: string;
  x: number;
  y: number;
  /** True when this node sits where the user put it, not where layout put it. */
  pinned: boolean;
}

export interface NodeMapLayout<N extends PositionedNode> {
  nodes: N[];
  edges: MapEdge[];
  width: number;
  height: number;
}

/**
 * Anchor points for an edge between two node boxes: bottom → top when the
 * target is below, top → bottom when it is above, side → side when they
 * overlap vertically (which only happens once nodes are hand-placed).
 */
export function anchorEdge(
  from: { x: number; y: number },
  to: { x: number; y: number },
  nodeW: number,
  nodeH: number,
  ids: { from: string; to: string } = { from: '', to: '' },
): MapEdge {
  const cxFrom = from.x + nodeW / 2;
  const cxTo = to.x + nodeW / 2;
  const cyFrom = from.y + nodeH / 2;
  const cyTo = to.y + nodeH / 2;
  if (to.y >= from.y + nodeH) {
    return { x1: cxFrom, y1: from.y + nodeH, x2: cxTo, y2: to.y, axis: 'v', ...ids };
  }
  if (from.y >= to.y + nodeH) {
    return { x1: cxFrom, y1: from.y, x2: cxTo, y2: to.y + nodeH, axis: 'v', ...ids };
  }
  return to.x >= from.x
    ? { x1: from.x + nodeW, y1: cyFrom, x2: to.x, y2: cyTo, axis: 'h', ...ids }
    : { x1: from.x, y1: cyFrom, x2: to.x + nodeW, y2: cyTo, axis: 'h', ...ids };
}

/** Node boxes that the point `(x, y)` falls inside, nearest last. */
export function nodeAt(
  nodes: readonly PositionedNode[],
  x: number,
  y: number,
  nodeW: number,
  nodeH: number,
  exclude: string,
): PositionedNode | null {
  let hit: PositionedNode | null = null;
  for (const n of nodes) {
    if (n.id === exclude) continue;
    if (x >= n.x && x <= n.x + nodeW && y >= n.y && y <= n.y + nodeH) hit = n;
  }
  return hit;
}

/**
 * A hand-placed position, if it is one worth trusting. A non-finite
 * coordinate from a hand-edited document would put a node nowhere at all.
 */
export function pinnedPosition(
  positions: MapPositions,
  id: string,
): { x: number; y: number } | null {
  const placed = positions[id];
  if (placed === undefined || !Number.isFinite(placed.x) || !Number.isFinite(placed.y)) return null;
  return { x: Math.max(0, placed.x), y: Math.max(0, placed.y) };
}

/**
 * Canvas size: the nodes' bounding box plus padding, so hand-placed nodes
 * extend the scrollable area rather than being clipped by it.
 */
export function mapBounds(
  nodes: readonly PositionedNode[],
  nodeW: number,
  nodeH: number,
  pad: number,
): { width: number; height: number } {
  let right = 0;
  let bottom = 0;
  for (const n of nodes) {
    right = Math.max(right, n.x + nodeW);
    bottom = Math.max(bottom, n.y + nodeH);
  }
  return { width: right + pad, height: bottom + pad };
}
