/** A screen rectangle, in Electron's DIP coordinates. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const GAP = 6;

/**
 * Where the menu-bar flyout opens (D51): centred under the icon when the bar
 * is at the top of the screen (macOS, most Linux panels), above it when the
 * bar is at the bottom (the Windows taskbar), and always kept inside the
 * screen's work area. Linux trays often report no bounds at all; then the
 * mouse position, which is where the click just happened, stands in.
 */
export function flyoutPosition(
  icon: Rect | null,
  size: { width: number; height: number },
  workArea: Rect,
  cursor: { x: number; y: number },
): { x: number; y: number } {
  const anchor =
    icon !== null && icon.width > 0 && icon.height > 0
      ? icon
      : { x: cursor.x, y: cursor.y, width: 0, height: 0 };
  const centreX = anchor.x + anchor.width / 2;
  const lowerHalf = anchor.y > workArea.y + workArea.height / 2;
  const x = centreX - size.width / 2;
  const y = lowerHalf ? anchor.y - size.height - GAP : anchor.y + anchor.height + GAP;
  const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);
  return {
    x: Math.round(clamp(x, workArea.x, workArea.x + workArea.width - size.width)),
    y: Math.round(clamp(y, workArea.y, workArea.y + workArea.height - size.height)),
  };
}
