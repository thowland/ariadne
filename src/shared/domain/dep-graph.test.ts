import { describe, expect, it } from 'vitest';

import type { Task } from '../types';

import { belowNode, layoutDepGraph, NODE_H, NODE_W, wouldCycle } from './dep-graph';

let n = 0;
function task(patch: Partial<Task> = {}): Task {
  n += 1;
  return {
    id: patch.id ?? `t${n}`,
    projectId: 'p1',
    title: 'Task',
    status: 'Todo',
    priority: 'Medium',
    tags: [],
    notes: '',
    dueDate: null,
    dependsOn: [],
    subtasks: [],
    links: [],
    createdAt: '2026-06-01',
    completedAt: null,
    ...patch,
  };
}

function nodeY(layout: NonNullable<ReturnType<typeof layoutDepGraph>>, id: string): number {
  const node = layout.nodes.find((nd) => nd.task.id === id);
  if (node === undefined) throw new Error(`missing node ${id}`);
  return node.y;
}

describe('layoutDepGraph', () => {
  it('returns null for fewer than two tasks or no internal edges', () => {
    expect(layoutDepGraph([])).toBeNull();
    expect(layoutDepGraph([task()])).toBeNull();
    expect(layoutDepGraph([task(), task()])).toBeNull();
    // Dependency pointing outside the project doesn't count.
    expect(layoutDepGraph([task({ dependsOn: ['elsewhere'] }), task()])).toBeNull();
  });

  it('lays a chain out in successive layers, top to bottom', () => {
    const a = task({ id: 'a' });
    const b = task({ id: 'b', dependsOn: ['a'] });
    const c = task({ id: 'c', dependsOn: ['b'] });
    const layout = layoutDepGraph([a, b, c]);
    expect(layout).not.toBeNull();
    const l = layout!;
    expect(nodeY(l, 'a')).toBeLessThan(nodeY(l, 'b'));
    expect(nodeY(l, 'b')).toBeLessThan(nodeY(l, 'c'));
    expect(l.edges).toHaveLength(2);
    // Chain of 3 → 3 layers tall, 1 node wide.
    expect(l.width).toBe(8 * 2 + NODE_W);
    expect(l.height).toBe(8 * 2 + 3 * (NODE_H + 44) - 44);
  });

  it('layers a diamond by longest path and centers narrow rows', () => {
    const root = task({ id: 'root' });
    const left = task({ id: 'left', dependsOn: ['root'] });
    const right = task({ id: 'right', dependsOn: ['root'] });
    const sink = task({ id: 'sink', dependsOn: ['left', 'right'] });
    const layout = layoutDepGraph([root, left, right, sink]);
    const l = layout!;
    expect(nodeY(l, 'left')).toBe(nodeY(l, 'right'));
    expect(nodeY(l, 'sink')).toBeGreaterThan(nodeY(l, 'left'));
    expect(l.edges).toHaveLength(4);
    // Root row (1 node) is centered over the 2-node row.
    const rootNode = l.nodes.find((nd) => nd.task.id === 'root');
    const leftNode = l.nodes.find((nd) => nd.task.id === 'left');
    const rightNode = l.nodes.find((nd) => nd.task.id === 'right');
    expect(rootNode!.x).toBeGreaterThan(leftNode!.x);
    expect(rootNode!.x).toBeLessThan(rightNode!.x);
  });

  it('longest path wins when a task has both short and long routes', () => {
    const a = task({ id: 'a' });
    const b = task({ id: 'b', dependsOn: ['a'] });
    const c = task({ id: 'c', dependsOn: ['a', 'b'] }); // direct + via b
    const l = layoutDepGraph([a, b, c])!;
    expect(nodeY(l, 'c')).toBeGreaterThan(nodeY(l, 'b'));
  });

  it('tolerates dependency cycles without recursing forever', () => {
    const a = task({ id: 'a', dependsOn: ['b'] });
    const b = task({ id: 'b', dependsOn: ['a'] });
    const l = layoutDepGraph([a, b]);
    expect(l).not.toBeNull();
    expect(l?.nodes).toHaveLength(2);
    // Both edges still drawn (a→b and b→a).
    expect(l?.edges).toHaveLength(2);
  });

  it('excludes Dropped tasks and their edges', () => {
    const a = task({ id: 'a' });
    const dropped = task({ id: 'x', status: 'Dropped', dependsOn: ['a'] });
    const b = task({ id: 'b', dependsOn: ['a', 'x'] });
    const l = layoutDepGraph([a, dropped, b])!;
    expect(l.nodes.map((nd) => nd.task.id).sort()).toEqual(['a', 'b']);
    expect(l.edges).toHaveLength(1); // only a→b survives
  });

  it('keeps disconnected tasks on layer 0 alongside the graph', () => {
    const a = task({ id: 'a' });
    const b = task({ id: 'b', dependsOn: ['a'] });
    const lone = task({ id: 'lone' });
    const l = layoutDepGraph([a, b, lone])!;
    expect(nodeY(l, 'lone')).toBe(nodeY(l, 'a'));
  });
});

describe('layoutDepGraph hand-placed positions', () => {
  const a = task({ id: 'a' });
  const b = task({ id: 'b', dependsOn: ['a'] });

  function node(l: NonNullable<ReturnType<typeof layoutDepGraph>>, id: string) {
    const found = l.nodes.find((nd) => nd.task.id === id);
    if (found === undefined) throw new Error(`missing node ${id}`);
    return found;
  }

  it('honours an override and leaves other nodes on their computed slot', () => {
    const auto = layoutDepGraph([a, b])!;
    const l = layoutDepGraph([a, b], { b: { x: 400, y: 300 } })!;
    expect(node(l, 'b')).toMatchObject({ x: 400, y: 300, pinned: true });
    expect(node(l, 'a')).toMatchObject({ x: node(auto, 'a').x, y: node(auto, 'a').y });
    expect(node(l, 'a').pinned).toBe(false);
  });

  it('grows the canvas to the bounding box of hand-placed nodes', () => {
    const l = layoutDepGraph([a, b], { b: { x: 400, y: 300 } })!;
    expect(l.width).toBe(400 + NODE_W + 8);
    expect(l.height).toBe(300 + NODE_H + 8);
  });

  it('clamps negative positions and ignores non-finite ones', () => {
    const l = layoutDepGraph([a, b], { a: { x: -50, y: -20 }, b: { x: NaN, y: 5 } })!;
    expect(node(l, 'a')).toMatchObject({ x: 0, y: 0 });
    expect(node(l, 'b').pinned).toBe(false);
  });

  it('ignores positions for task ids that are not in the graph', () => {
    const auto = layoutDepGraph([a, b])!;
    const l = layoutDepGraph([a, b], { ghost: { x: 900, y: 900 } })!;
    expect(l.width).toBe(auto.width);
    expect(l.nodes.every((nd) => !nd.pinned)).toBe(true);
  });

  it('re-anchors edges to the facing sides as nodes move', () => {
    // Default stacking: a above b → bottom of a to top of b.
    const down = layoutDepGraph([a, b])!.edges[0]!;
    expect(down.axis).toBe('v');
    expect(down.y1).toBe(8 + NODE_H);
    expect(down.y2).toBe(8 + NODE_H + 44);

    // Drag the dependent above its blocker → the line flips to top-to-bottom.
    const up = layoutDepGraph([a, b], { b: { x: 8, y: 0 }, a: { x: 8, y: 300 } })!.edges[0]!;
    expect(up.axis).toBe('v');
    expect(up.y1).toBe(300); // top of a
    expect(up.y2).toBe(NODE_H); // bottom of b

    // Side by side → left/right anchors at mid-height.
    const side = layoutDepGraph([a, b], { a: { x: 0, y: 100 }, b: { x: 400, y: 100 } })!.edges[0]!;
    expect(side).toMatchObject({
      axis: 'h',
      x1: NODE_W,
      y1: 100 + NODE_H / 2,
      x2: 400,
      y2: 100 + NODE_H / 2,
    });

    const back = layoutDepGraph([a, b], { a: { x: 400, y: 100 }, b: { x: 0, y: 100 } })!.edges[0]!;
    expect(back).toMatchObject({ axis: 'h', x1: 400, x2: NODE_W });
  });
});

describe('wouldCycle (D37)', () => {
  const chain = (): Task[] => [
    task({ id: 'a' }),
    task({ id: 'b', dependsOn: ['a'] }),
    task({ id: 'c', dependsOn: ['b'] }),
  ];

  it('is true for a link that closes a loop, however long the chain', () => {
    // c already waits on b waits on a; making a wait on c closes the ring.
    expect(wouldCycle(chain(), 'a', 'c')).toBe(true);
    expect(wouldCycle(chain(), 'a', 'b')).toBe(true);
  });

  it('is true for a task depending on itself', () => {
    expect(wouldCycle(chain(), 'a', 'a')).toBe(true);
  });

  it('is false for a link that only deepens the chain', () => {
    expect(wouldCycle(chain(), 'c', 'a')).toBe(false);
    expect(wouldCycle([...chain(), task({ id: 'd' })], 'd', 'c')).toBe(false);
  });

  it('terminates on data that already contains a cycle', () => {
    // normalizeWorkspace would not produce this, a hand-edited file might.
    const looped = [task({ id: 'a', dependsOn: ['b'] }), task({ id: 'b', dependsOn: ['a'] })];
    expect(wouldCycle(looped, 'a', 'b')).toBe(true);
    expect(wouldCycle([...looped, task({ id: 'c' })], 'c', 'a')).toBe(false);
  });
});

describe('belowNode', () => {
  it('is one layout row under the predecessor, same column', () => {
    const under = belowNode({ x: 40, y: 100 });
    expect(under.x).toBe(40);
    expect(under.y).toBeGreaterThan(100 + NODE_H);
  });
});
