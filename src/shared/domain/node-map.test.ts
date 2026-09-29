import { describe, expect, it } from 'vitest';

import {
  anchorEdge,
  mapBounds,
  nodeAt,
  pinnedPosition,
  SNAP_THRESHOLD,
  snapPosition,
} from './node-map';

const W = 100;
const H = 40;

describe('anchorEdge', () => {
  it('leaves the bottom and enters the top when the target is below', () => {
    const e = anchorEdge({ x: 0, y: 0 }, { x: 0, y: 200 }, W, H, { from: 'a', to: 'b' });
    expect(e).toEqual({ x1: 50, y1: 40, x2: 50, y2: 200, axis: 'v', from: 'a', to: 'b' });
  });

  it('leaves the top and enters the bottom when the target is above', () => {
    const e = anchorEdge({ x: 0, y: 200 }, { x: 0, y: 0 }, W, H, { from: 'a', to: 'b' });
    expect(e).toEqual({ x1: 50, y1: 200, x2: 50, y2: 40, axis: 'v', from: 'a', to: 'b' });
  });

  it('goes side to side when the boxes overlap vertically', () => {
    // Only reachable once a node has been hand-placed beside another.
    const ids = { from: 'a', to: 'b' };
    const right = anchorEdge({ x: 0, y: 0 }, { x: 300, y: 10 }, W, H, ids);
    expect(right).toEqual({ x1: 100, y1: 20, x2: 300, y2: 30, axis: 'h', ...ids });
    const left = anchorEdge({ x: 300, y: 0 }, { x: 0, y: 10 }, W, H, ids);
    expect(left).toEqual({ x1: 300, y1: 20, x2: 100, y2: 30, axis: 'h', ...ids });
  });

  it('treats exactly touching boxes as vertical, not overlapping', () => {
    expect(anchorEdge({ x: 0, y: 0 }, { x: 0, y: H }, W, H).axis).toBe('v');
  });
});

describe('nodeAt', () => {
  const nodes = [
    { id: 'a', x: 0, y: 0, pinned: false },
    { id: 'b', x: 200, y: 0, pinned: false },
  ];

  it('finds the box a point falls inside', () => {
    expect(nodeAt(nodes, 250, 20, W, H, 'a')?.id).toBe('b');
    expect(nodeAt(nodes, 200, 0, W, H, 'a')?.id).toBe('b');
    expect(nodeAt(nodes, 300, 40, W, H, 'a')?.id).toBe('b');
  });

  it('is null in the gaps', () => {
    expect(nodeAt(nodes, 150, 20, W, H, 'a')).toBeNull();
    expect(nodeAt(nodes, 250, 90, W, H, 'a')).toBeNull();
  });

  it('never reports the node being dragged', () => {
    // Otherwise a box would always be hovering over itself.
    expect(nodeAt(nodes, 20, 20, W, H, 'a')).toBeNull();
    expect(nodeAt(nodes, 20, 20, W, H, 'b')?.id).toBe('a');
  });

  it('picks the last box drawn when two overlap', () => {
    const stacked = [...nodes, { id: 'c', x: 190, y: 0, pinned: true }];
    expect(nodeAt(stacked, 250, 20, W, H, 'a')?.id).toBe('c');
  });
});

describe('pinnedPosition', () => {
  it('returns a hand-placed position', () => {
    expect(pinnedPosition({ a: { x: 12, y: 34 } }, 'a')).toEqual({ x: 12, y: 34 });
  });

  it('is null for a node nobody placed', () => {
    expect(pinnedPosition({}, 'a')).toBeNull();
  });

  it('rejects a non-finite coordinate rather than putting a node nowhere', () => {
    expect(pinnedPosition({ a: { x: NaN, y: 3 } }, 'a')).toBeNull();
    expect(pinnedPosition({ a: { x: 3, y: Infinity } }, 'a')).toBeNull();
  });

  it('clamps a negative coordinate into the canvas', () => {
    expect(pinnedPosition({ a: { x: -50, y: -1 } }, 'a')).toEqual({ x: 0, y: 0 });
  });
});

describe('mapBounds', () => {
  it('is the bounding box of the nodes plus padding', () => {
    const nodes = [
      { id: 'a', x: 0, y: 0, pinned: false },
      { id: 'b', x: 300, y: 120, pinned: true },
    ];
    expect(mapBounds(nodes, W, H, 8)).toEqual({ width: 408, height: 168 });
  });

  it('is just the padding when there is nothing to bound', () => {
    expect(mapBounds([], W, H, 8)).toEqual({ width: 8, height: 8 });
  });
});

describe('snapPosition', () => {
  // W = 100, H = 40 as above.
  it('falls onto the grid when no other box is near', () => {
    expect(snapPosition(23, 47, [], W, H)).toEqual({ x: 20, y: 50, guides: [] });
    expect(snapPosition(26, 44, [], W, H, { grid: 20 })).toEqual({ x: 20, y: 40, guides: [] });
  });

  it('locks to another box’s column and draws the guide through both', () => {
    // 4px left of the other box's column, far below it.
    const r = snapPosition(213, 300, [{ x: 217, y: 10 }], W, H);
    expect(r.x).toBe(217);
    expect(r.y).toBe(300); // nothing near vertically: the grid
    expect(r.guides).toEqual([{ axis: 'x', at: 267, from: 10, to: 340 }]);
  });

  it('locks to another box’s row', () => {
    const r = snapPosition(400, 93, [{ x: 17, y: 88 }], W, H);
    expect(r.y).toBe(88);
    expect(r.guides).toEqual([{ axis: 'y', at: 108, from: 17, to: 500 }]);
  });

  it('decides each axis on its own, and can lock both at once', () => {
    const others = [
      { x: 217, y: 10 },
      { x: 503, y: 88 },
    ];
    const r = snapPosition(215, 91, others, W, H);
    expect({ x: r.x, y: r.y }).toEqual({ x: 217, y: 88 });
    expect(r.guides.map((g) => g.axis)).toEqual(['x', 'y']);
  });

  it('prefers the nearest of several candidates', () => {
    const r = snapPosition(
      100,
      300,
      [
        { x: 95, y: 0 },
        { x: 103, y: 0 },
      ],
      W,
      H,
    );
    expect(r.x).toBe(103);
  });

  it('ignores a box just past the threshold', () => {
    const r = snapPosition(100, 300, [{ x: 100 + SNAP_THRESHOLD + 1, y: 0 }], W, H);
    expect(r.x).toBe(100);
    expect(r.guides).toEqual([]);
  });

  it('never snaps a box above or left of the canvas', () => {
    expect(snapPosition(2, 3, [{ x: -4, y: -4 }], W, H)).toMatchObject({ x: 0, y: 0 });
  });

  it('lengthens the guide over every box already on the line', () => {
    const others = [
      { x: 50, y: 0 },
      { x: 50, y: 500 },
    ];
    const r = snapPosition(52, 250, others, W, H);
    expect(r.guides).toEqual([{ axis: 'x', at: 100, from: 0, to: 540 }]);
  });
});
