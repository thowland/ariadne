import { describe, expect, it } from 'vitest';

import { flyoutPosition } from './flyout-position';

const size = { width: 400, height: 300 };
const screen = { x: 0, y: 25, width: 1440, height: 875 };
const cursor = { x: 0, y: 0 };

describe('flyoutPosition (D51)', () => {
  it('opens centred under an icon in a top menu bar', () => {
    expect(flyoutPosition({ x: 1000, y: 0, width: 24, height: 24 }, size, screen, cursor)).toEqual({
      x: 812,
      y: 30,
    });
  });

  it('opens above an icon in a bottom taskbar', () => {
    const work = { x: 0, y: 0, width: 1920, height: 1040 };
    expect(flyoutPosition({ x: 1700, y: 1044, width: 24, height: 32 }, size, work, cursor)).toEqual(
      { x: 1512, y: 738 },
    );
  });

  it('stays on screen when the icon is near the edge', () => {
    expect(flyoutPosition({ x: 1420, y: 0, width: 20, height: 24 }, size, screen, cursor).x).toBe(
      1040,
    );
    expect(flyoutPosition({ x: 2, y: 0, width: 20, height: 24 }, size, screen, cursor).x).toBe(0);
  });

  it('falls back to the mouse when the tray reports no bounds', () => {
    expect(flyoutPosition(null, size, screen, { x: 700, y: 10 })).toEqual({ x: 500, y: 25 });
    expect(
      flyoutPosition({ x: 0, y: 0, width: 0, height: 0 }, size, screen, { x: 700, y: 10 }),
    ).toEqual({ x: 500, y: 25 });
  });
});
