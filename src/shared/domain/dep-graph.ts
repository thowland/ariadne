import type { Task } from '../types';

/**
 * Dependency-map layout (prototype _depGraph), as pure geometry. Tasks are
 * layered by dependency depth (longest path from roots, cycle-safe via a
 * visited set); each layer is a horizontal centered row; layers stack
 * top → bottom so long chains grow downward.
 */

export const NODE_W = 172;
export const NODE_H = 54;
const ROW_GAP = 44;
const COL_GAP = 16;
const PAD_L = 8;
const PAD_T = 8;

export interface GraphNode {
  task: Task;
  x: number;
  y: number;
}

export interface GraphEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface DepGraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
}

/**
 * Null when there is nothing worth drawing: fewer than two live tasks, or no
 * dependency edges between them (prototype empty state).
 */
export function layoutDepGraph(projectTasks: readonly Task[]): DepGraphLayout | null {
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
  for (const [layer, list] of layers) {
    const startX = PAD_L + (rowW - (list.length * (NODE_W + COL_GAP) - COL_GAP)) / 2;
    list.forEach((t, i) => {
      pos.set(t.id, { x: startX + i * (NODE_W + COL_GAP), y: PAD_T + layer * (NODE_H + ROW_GAP) });
    });
  }

  const edges: GraphEdge[] = [];
  for (const t of tasks) {
    for (const d of t.dependsOn) {
      const from = pos.get(d);
      const to = pos.get(t.id);
      if (from !== undefined && to !== undefined) {
        edges.push({
          x1: from.x + NODE_W / 2,
          y1: from.y + NODE_H,
          x2: to.x + NODE_W / 2,
          y2: to.y,
        });
      }
    }
  }

  return {
    nodes: tasks.map((t) => {
      const p = pos.get(t.id) ?? { x: PAD_L, y: PAD_T };
      return { task: t, x: p.x, y: p.y };
    }),
    edges,
    width: PAD_L * 2 + rowW,
    height: PAD_T * 2 + (maxLayer + 1) * (NODE_H + ROW_GAP) - ROW_GAP,
  };
}
