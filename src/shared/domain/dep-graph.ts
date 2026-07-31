import type { Task } from '../types';

/**
 * Dependency-map layout (prototype _depGraph), as pure geometry. Tasks are
 * layered by dependency depth (longest path from roots, cycle-safe via a
 * visited set); each layer is a horizontal centered row; layers stack
 * top → bottom so long chains grow downward.
 *
 * Hand-placed positions (D20) override the computed row for any task id they
 * name; everything else keeps its auto slot. Edge anchors are then picked from
 * the actual box geometry so the lines follow the nodes around.
 */

export const NODE_W = 172;
export const NODE_H = 54;
const ROW_GAP = 44;
const COL_GAP = 16;
const PAD_L = 8;
const PAD_T = 8;

/** Hand-placed node positions, keyed by task id. */
export type DepPositions = Readonly<Record<string, { x: number; y: number }>>;

export interface GraphNode {
  task: Task;
  x: number;
  y: number;
  /** True when this node sits where the user put it, not where layout put it. */
  pinned: boolean;
}

export interface GraphEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Which axis the line leaves and enters on — drives the curve's bend. */
  axis: 'v' | 'h';
}

export interface DepGraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
}

/**
 * Anchor points for an edge between two node boxes: bottom → top when the
 * target is below, top → bottom when it is above, side → side when they
 * overlap vertically (which only happens once nodes are hand-placed).
 */
function anchorEdge(from: { x: number; y: number }, to: { x: number; y: number }): GraphEdge {
  const cxFrom = from.x + NODE_W / 2;
  const cxTo = to.x + NODE_W / 2;
  const cyFrom = from.y + NODE_H / 2;
  const cyTo = to.y + NODE_H / 2;
  if (to.y >= from.y + NODE_H) {
    return { x1: cxFrom, y1: from.y + NODE_H, x2: cxTo, y2: to.y, axis: 'v' };
  }
  if (from.y >= to.y + NODE_H) {
    return { x1: cxFrom, y1: from.y, x2: cxTo, y2: to.y + NODE_H, axis: 'v' };
  }
  return to.x >= from.x
    ? { x1: from.x + NODE_W, y1: cyFrom, x2: to.x, y2: cyTo, axis: 'h' }
    : { x1: from.x, y1: cyFrom, x2: to.x + NODE_W, y2: cyTo, axis: 'h' };
}

/**
 * Null when there is nothing worth drawing: fewer than two live tasks, or no
 * dependency edges between them (prototype empty state).
 */
export function layoutDepGraph(
  projectTasks: readonly Task[],
  positions: DepPositions = {},
): DepGraphLayout | null {
  const tasks = projectTasks.filter((t) => t.status !== 'Dropped');
  const ids = new Set(tasks.map((t) => t.id));
  const hasEdge = tasks.some((t) => t.dependsOn.some((d) => ids.has(d)));
  if (tasks.length < 2 || !hasEdge) return null;

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const memo = new Map<string, number>();

  const layerOf = (id: string, seen: Set<string>): number => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    const task = byId.get(id);
    const deps = (task?.dependsOn ?? []).filter((d) => ids.has(d) && !seen.has(d));
    let layer = 0;
    for (const d of deps) {
      layer = Math.max(layer, layerOf(d, new Set([...seen, id])) + 1);
    }
    memo.set(id, layer);
    return layer;
  };
  for (const t of tasks) layerOf(t.id, new Set([t.id]));

  const layers = new Map<number, Task[]>();
  let maxLayer = 0;
  for (const t of tasks) {
    const layer = memo.get(t.id) ?? 0;
    maxLayer = Math.max(maxLayer, layer);
    const list = layers.get(layer);
    if (list === undefined) layers.set(layer, [t]);
    else list.push(t);
  }

  let maxCols = 0;
  for (const list of layers.values()) maxCols = Math.max(maxCols, list.length);
  const rowW = maxCols * (NODE_W + COL_GAP) - COL_GAP;

  const pos = new Map<string, { x: number; y: number }>();
  const pinned = new Set<string>();
  for (const [layer, list] of layers) {
    const startX = PAD_L + (rowW - (list.length * (NODE_W + COL_GAP) - COL_GAP)) / 2;
    list.forEach((t, i) => {
      const placed = positions[t.id];
      if (placed !== undefined && Number.isFinite(placed.x) && Number.isFinite(placed.y)) {
        pos.set(t.id, { x: Math.max(0, placed.x), y: Math.max(0, placed.y) });
        pinned.add(t.id);
        return;
      }
      pos.set(t.id, { x: startX + i * (NODE_W + COL_GAP), y: PAD_T + layer * (NODE_H + ROW_GAP) });
    });
  }

  const edges: GraphEdge[] = [];
  for (const t of tasks) {
    for (const d of t.dependsOn) {
      const from = pos.get(d);
      const to = pos.get(t.id);
      if (from !== undefined && to !== undefined) edges.push(anchorEdge(from, to));
    }
  }

  const nodes = tasks.map((t) => {
    const p = pos.get(t.id) ?? { x: PAD_L, y: PAD_T };
    return { task: t, x: p.x, y: p.y, pinned: pinned.has(t.id) };
  });

  // Bounding box, so hand-placed nodes extend the scrollable canvas. With no
  // overrides this reproduces the old row-based width/height exactly.
  let right = 0;
  let bottom = 0;
  for (const n of nodes) {
    right = Math.max(right, n.x + NODE_W);
    bottom = Math.max(bottom, n.y + NODE_H);
  }

  return { nodes, edges, width: right + PAD_L, height: bottom + PAD_T };
}
