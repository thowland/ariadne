import type { Task } from '../types';

import type { MapEdge, MapPositions, NodeMapLayout, PositionedNode } from './node-map';
import { anchorEdge, mapBounds, pinnedPosition } from './node-map';

/**
 * Dependency-map layout (prototype _depGraph), as pure geometry. Tasks are
 * layered by dependency depth (longest path from roots, cycle-safe via a
 * visited set); each layer is a horizontal centered row; layers stack
 * top → bottom so long chains grow downward.
 *
 * Hand-placed positions (D20) override the computed row for any task id they
 * name; everything else keeps its auto slot. Edge anchors and the canvas
 * bounding box come from `node-map.ts`, shared with the org map (D34).
 */

export const NODE_W = 172;
export const NODE_H = 54;
const ROW_GAP = 44;
const COL_GAP = 16;
const PAD_L = 8;
const PAD_T = 8;

/** Hand-placed node positions, keyed by task id. */
export type DepPositions = MapPositions;

export interface GraphNode extends PositionedNode {
  task: Task;
}

export type GraphEdge = MapEdge;
export type DepGraphLayout = NodeMapLayout<GraphNode>;

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
      const placed = pinnedPosition(positions, t.id);
      if (placed !== null) {
        pos.set(t.id, placed);
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
      if (from !== undefined && to !== undefined) {
        edges.push(anchorEdge(from, to, NODE_W, NODE_H));
      }
    }
  }

  const nodes: GraphNode[] = tasks.map((t) => {
    const p = pos.get(t.id) ?? { x: PAD_L, y: PAD_T };
    return { id: t.id, task: t, x: p.x, y: p.y, pinned: pinned.has(t.id) };
  });

  return { nodes, edges, ...mapBounds(nodes, NODE_W, NODE_H, PAD_L) };
}
