import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useStore } from '../app/store';
import type { ContextMenuItem, ContextMenuState } from '../app/store';

/**
 * The one right-click menu (D21), rendered by App from store state so only one
 * can be open at a time. Callers describe the actions; this owns placement,
 * dismissal, and keyboard navigation.
 *
 * Everything a menu offers must also be reachable without it — the menu is an
 * accelerator for expert users, never the only route to an action.
 */

/** Keeps the panel inside the viewport, flipping at the right/bottom edges. */
const EDGE_PAD = 8;

export function ContextMenu(): React.JSX.Element | null {
  const menu = useStore((s) => s.contextMenu);
  const closeContextMenu = useStore((s) => s.closeContextMenu);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Measure after mount, before paint, so the menu never flashes off-screen.
  useLayoutEffect(() => {
    if (menu === null) {
      setPos(null);
      return;
    }
    const el = panelRef.current;
    const w = el?.offsetWidth ?? 220;
    const h = el?.offsetHeight ?? 0;
    const maxLeft = window.innerWidth - w - EDGE_PAD;
    const maxTop = window.innerHeight - h - EDGE_PAD;
    setPos({
      left: Math.max(EDGE_PAD, Math.min(menu.x, Math.max(EDGE_PAD, maxLeft))),
      top: Math.max(EDGE_PAD, Math.min(menu.y, Math.max(EDGE_PAD, maxTop))),
    });
  }, [menu]);

  // Focus the first enabled row so the whole menu is keyboard-drivable. A
  // danger row is never focused first: Enter must not delete on open.
  useEffect(() => {
    if (menu === null) return;
    const rows = panelRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    const first = [...(rows ?? [])].find((r) => r.dataset.danger !== 'true') ?? rows?.[0];
    first?.focus();
  }, [menu]);

  // Any scroll or resize invalidates the anchor point, so close rather than
  // leave the menu floating next to the wrong row.
  useEffect(() => {
    if (menu === null) return;
    const close = (): void => {
      closeContextMenu();
    };
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [menu, closeContextMenu]);

  if (menu === null) return null;

  const move = (from: HTMLElement, delta: number): void => {
    const rows = [
      ...(panelRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []),
    ].filter((r) => !r.disabled);
    const i = rows.indexOf(from as HTMLButtonElement);
    rows[(i + delta + rows.length) % rows.length]?.focus();
  };

  return (
    <div
      className="context-menu-overlay"
      // Right-clicking elsewhere should move the menu, not open the OS one.
      onContextMenu={(e) => {
        e.preventDefault();
        closeContextMenu();
      }}
      onMouseDown={closeContextMenu}
    >
      <div
        ref={panelRef}
        className="context-menu"
        role="menu"
        aria-label={menu.label}
        data-testid="context-menu"
        style={{
          left: pos?.left ?? menu.x,
          top: pos?.top ?? menu.y,
          visibility: pos === null ? 'hidden' : 'visible',
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            move(e.target as HTMLElement, e.key === 'ArrowDown' ? 1 : -1);
          }
        }}
      >
        {menu.items.map((item, i) => (
          <button
            key={item.label}
            role="menuitem"
            className={`context-menu-item${item.danger === true ? ' danger' : ''}${
              item.separatorBefore === true && i > 0 ? ' sep' : ''
            }`}
            data-danger={item.danger === true ? 'true' : undefined}
            disabled={item.disabled === true}
            onClick={() => {
              closeContextMenu();
              item.onSelect();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Builds an `onContextMenu` handler. A plain function, not a hook, so rows
 * inside a `.map()` can each have one. `build` runs on right-click, so the
 * items reflect state then rather than at render time.
 */
export function menuHandler(
  open: (menu: ContextMenuState) => void,
  label: string,
  build: () => ContextMenuItem[],
): (e: React.MouseEvent) => void {
  return (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const items = build();
    if (items.length > 0) open({ x: e.clientX, y: e.clientY, label, items });
  };
}
