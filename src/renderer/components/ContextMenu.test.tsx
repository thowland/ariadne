import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useStore } from '../app/store';
import type { ContextMenuItem } from '../app/store';
import { setupTestApp } from '../test-utils';

import { ContextMenu, menuHandler } from './ContextMenu';

beforeEach(() => {
  setupTestApp();
  useStore.setState({ contextMenu: null });
});

/** Opening is a store update, so it must be flushed inside act(). */
function open(items: ContextMenuItem[], x = 40, y = 60): void {
  act(() => {
    useStore.getState().openContextMenu({ x, y, label: 'Test menu', items });
  });
}

const noop = (): void => {
  /* no-op */
};

describe('ContextMenu', () => {
  it('renders nothing until a menu is opened', () => {
    render(<ContextMenu />);
    expect(screen.queryByTestId('context-menu')).not.toBeInTheDocument();
  });

  it('renders the items as a labelled menu', () => {
    render(<ContextMenu />);
    open([
      { label: 'First', onSelect: noop },
      { label: 'Second', onSelect: noop, separatorBefore: true },
    ]);
    const menu = screen.getByRole('menu', { name: 'Test menu' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual(['First', 'Second']);
  });

  it('runs the action and closes on click', async () => {
    const onSelect = vi.fn();
    render(<ContextMenu />);
    open([{ label: 'Do it', onSelect }]);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Do it' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(useStore.getState().contextMenu).toBeNull();
  });

  it('never fires a disabled item', async () => {
    const onSelect = vi.fn();
    render(<ContextMenu />);
    open([{ label: 'Nope', onSelect, disabled: true }]);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Nope' }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(useStore.getState().contextMenu).not.toBeNull();
  });

  it('focuses the first non-destructive row, so Enter cannot delete on open', () => {
    render(<ContextMenu />);
    open([
      { label: 'Delete it', onSelect: noop, danger: true },
      { label: 'Safe', onSelect: noop },
    ]);
    expect(screen.getByRole('menuitem', { name: 'Safe' })).toHaveFocus();
  });

  it('walks rows with the arrow keys, wrapping at the ends', async () => {
    render(<ContextMenu />);
    open([
      { label: 'One', onSelect: noop },
      { label: 'Two', onSelect: noop },
      { label: 'Three', onSelect: noop },
    ]);
    expect(screen.getByRole('menuitem', { name: 'One' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Two' })).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'Three' })).toHaveFocus();
  });

  it('closes on an outside press but not on a press inside', () => {
    render(<ContextMenu />);
    open([{ label: 'One', onSelect: noop }]);
    fireEvent.mouseDown(screen.getByTestId('context-menu'));
    expect(useStore.getState().contextMenu).not.toBeNull();
    fireEvent.mouseDown(document.querySelector('.context-menu-overlay')!);
    expect(useStore.getState().contextMenu).toBeNull();
  });

  it('closes when the page scrolls out from under it', () => {
    render(<ContextMenu />);
    open([{ label: 'One', onSelect: noop }]);
    fireEvent.scroll(window);
    expect(useStore.getState().contextMenu).toBeNull();
  });

  it('keeps the panel inside the viewport near the right/bottom edges', () => {
    render(<ContextMenu />);
    open([{ label: 'One', onSelect: noop }], window.innerWidth + 500, window.innerHeight + 500);
    const panel = screen.getByTestId('context-menu');
    // jsdom reports zero-size elements, so the clamp lands on the pad itself
    // rather than off-screen at the click point.
    expect(parseInt(panel.style.left, 10)).toBeLessThan(window.innerWidth);
    expect(parseInt(panel.style.top, 10)).toBeLessThan(window.innerHeight);
  });
});

describe('menuHandler', () => {
  it('opens a menu at the pointer and suppresses the native one', () => {
    const openMenu = vi.fn();
    const handler = menuHandler(openMenu, 'Row', () => [{ label: 'A', onSelect: noop }]);
    const preventDefault = vi.fn();
    handler({ preventDefault, stopPropagation: noop, clientX: 12, clientY: 34 } as never);
    expect(preventDefault).toHaveBeenCalled();
    expect(openMenu).toHaveBeenCalledWith({
      x: 12,
      y: 34,
      label: 'Row',
      items: [expect.objectContaining({ label: 'A' })],
    });
  });

  it('opens nothing when there are no items to show', () => {
    const openMenu = vi.fn();
    const handler = menuHandler(openMenu, 'Row', () => []);
    handler({ preventDefault: noop, stopPropagation: noop, clientX: 0, clientY: 0 } as never);
    expect(openMenu).not.toHaveBeenCalled();
  });
});
