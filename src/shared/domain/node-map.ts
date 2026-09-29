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

// ---------- Snapping ----------

/** Grid pitch (px) a dragged box falls onto when no other box is near. */
export const SNAP_GRID = 10;
/** How close (px) an edge or centre must come to another box's to lock on. */
export const SNAP_THRESHOLD = 6;

/**
 * An alignment line to draw while dragging. `axis: 'x'` is a vertical line
 * at x = `at` running from y = `from` to `to`; `'y'` is the horizontal twin.
 */
export interface SnapGuide {
  axis: 'x' | 'y';
  at: number;
  from: number;
  to: number;
}

export interface SnapResult {
  x: number;
  y: number;
  guides: SnapGuide[];
}

/** Left/centre/right (or top/middle/bottom) of a box along one axis. */
function lines(start: number, size: number): number[] {
  return [start, start + size / 2, start + size];
}

/**
 * Centre first, so when a box's edges and centre all line up at once — which
 * is always, for two boxes the same size — the one guide drawn is the centre.
 */
const LINE_ORDER = [1, 0, 2] as const;

/**
 * The nearest same-kind alignment along one axis — left to left, centre to
 * centre, right to right — or null when nothing is within the threshold.
 * Cross-kind pairs (my left to your right) are left out on purpose: they
 * snap boxes into touching, which is never the arrangement anyone wants.
 */
function nearestAlignment(
  start: number,
  size: number,
  others: readonly number[],
  threshold: number,
): { delta: number; line: number } | null {
  const mine = lines(start, size);
  let best: { delta: number; line: number } | null = null;
  for (const o of others) {
    const theirs = lines(o, size);
    for (const k of LINE_ORDER) {
      const delta = (theirs[k] ?? 0) - (mine[k] ?? 0);
      if (
        Math.abs(delta) <= threshold &&
        (best === null || Math.abs(delta) < Math.abs(best.delta))
      ) {
        best = { delta, line: k };
      }
    }
  }
  return best;
}

/** The guide for one locked axis, spanning every box that shares the line. */
function guideFor(
  axis: 'x' | 'y',
  at: number,
  line: number,
  size: number,
  crossSize: number,
  cross: number,
  others: readonly { along: number; cross: number }[],
): SnapGuide {
  const hits = others.filter((o) => Math.abs((lines(o.along, size)[line] ?? 0) - at) < 0.5);
  const span = [cross, ...hits.map((o) => o.cross)];
  return { axis, at, from: Math.min(...span), to: Math.max(...span) + crossSize };
}

/**
 * Where a dragged box should land, and the guides that explain why.
 *
 * Each axis is decided on its own: if an edge or the centre comes within
 * `threshold` of the same line on another box, it locks to it and a guide is
 * drawn spanning every box on that line; otherwise it falls onto the grid.
 * Alignment wins over the grid because the layout's own rows and columns are
 * not on any grid, and lining up with them is the point.
 *
 * Pure, so every map built on `NodeMap` snaps identically.
 */
export function snapPosition(
  x: number,
  y: number,
  others: readonly { x: number; y: number }[],
  nodeW: number,
  nodeH: number,
  { grid = SNAP_GRID, threshold = SNAP_THRESHOLD }: { grid?: number; threshold?: number } = {},
): SnapResult {
  const ax = nearestAlignment(
    x,
    nodeW,
    others.map((o) => o.x),
    threshold,
  );
  const ay = nearestAlignment(
    y,
    nodeH,
    others.map((o) => o.y),
    threshold,
  );
  const sx = Math.max(0, ax === null ? Math.round(x / grid) * grid : x + ax.delta);
  const sy = Math.max(0, ay === null ? Math.round(y / grid) * grid : y + ay.delta);

  const guides: SnapGuide[] = [];
  if (ax !== null) {
    const at = lines(sx, nodeW)[ax.line] ?? sx;
    const byX = others.map((o) => ({ along: o.x, cross: o.y }));
    guides.push(guideFor('x', at, ax.line, nodeW, nodeH, sy, byX));
  }
  if (ay !== null) {
    const at = lines(sy, nodeH)[ay.line] ?? sy;
    const byY = others.map((o) => ({ along: o.y, cross: o.x }));
    guides.push(guideFor('y', at, ay.line, nodeH, nodeW, sx, byY));
  }
  return { x: sx, y: sy, guides };
}
