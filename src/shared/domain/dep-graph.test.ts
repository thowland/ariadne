import { describe, expect, it } from 'vitest';

import type { Task } from '../types';

import { layoutDepGraph, NODE_H, NODE_W } from './dep-graph';

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
