import { describe, expect, it } from 'vitest';

import { anchorEdge, mapBounds, pinnedPosition } from './node-map';

const W = 100;
const H = 40;

describe('anchorEdge', () => {
  it('leaves the bottom and enters the top when the target is below', () => {
    const e = anchorEdge({ x: 0, y: 0 }, { x: 0, y: 200 }, W, H);
    expect(e).toEqual({ x1: 50, y1: 40, x2: 50, y2: 200, axis: 'v' });
  });

  it('leaves the top and enters the bottom when the target is above', () => {
    const e = anchorEdge({ x: 0, y: 200 }, { x: 0, y: 0 }, W, H);
    expect(e).toEqual({ x1: 50, y1: 200, x2: 50, y2: 40, axis: 'v' });
  });

  it('goes side to side when the boxes overlap vertically', () => {
    // Only reachable once a node has been hand-placed beside another.
    const right = anchorEdge({ x: 0, y: 0 }, { x: 300, y: 10 }, W, H);
    expect(right).toEqual({ x1: 100, y1: 20, x2: 300, y2: 30, axis: 'h' });
    const left = anchorEdge({ x: 300, y: 0 }, { x: 0, y: 10 }, W, H);
    expect(left).toEqual({ x1: 300, y1: 20, x2: 100, y2: 30, axis: 'h' });
  });

  it('treats exactly touching boxes as vertical, not overlapping', () => {
    expect(anchorEdge({ x: 0, y: 0 }, { x: 0, y: H }, W, H).axis).toBe('v');
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
