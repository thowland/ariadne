import type { Contact } from '@shared/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useStore } from '../app/store';
import { loadTestWorkspace, setupTestApp } from '../test-utils';

import { OrgMap } from './OrgMap';

beforeEach(() => {
  setupTestApp();
  loadTestWorkspace();
});

function ws() {
  const w = useStore.getState().workspace;
  if (w === null) throw new Error('no workspace');
  return w;
}

function contact(id: string): Contact {
  const c = ws().contacts.find((x) => x.id === id);
  if (c === undefined) throw new Error(`no contact ${id}`);
  return c;
}

/** Node origin, read off the rendered rect. */
function rectXY(id: string): { x: number; y: number } {
  const rect = screen.getByTestId(`org-node-${id}`).querySelector('rect');
  if (rect === null) throw new Error(`no rect for ${id}`);
  return { x: Number(rect.getAttribute('x')), y: Number(rect.getAttribute('y')) };
}

function edgePaths(): string[] {
  return [...screen.getByTestId('org-map').querySelectorAll('path[marker-end]')].map(
    (p) => p.getAttribute('d') ?? '',
  );
}

/**
 * jsdom has no PointerEvent constructor, so fireEvent.pointerX() drops
 * clientX/clientY. MouseEvent carries them and satisfies the handlers.
 */
function pointer(target: Window | Element, type: string, init: MouseEventInit): void {
  fireEvent(target, new MouseEvent(type, { bubbles: true, ...init }));
}

function drag(id: string, from: [number, number], to: [number, number]): void {
  const node = screen.getByTestId(`org-node-${id}`);
  pointer(node, 'pointerdown', { button: 0, clientX: from[0], clientY: from[1] });
  // Alt held: free placement, so these tests can assert exact positions.
  // Snapping has its own tests below.
  pointer(window, 'pointermove', { clientX: to[0], clientY: to[1], altKey: true });
  pointer(window, 'pointerup', { clientX: to[0], clientY: to[1] });
  fireEvent.click(node);
}

describe('OrgMap', () => {
  it('shows the manager above and the reports below, labelled', () => {
    // Rachel Okonjo (c8) manages Marcus (c2) and Sofia (c6).
    render(<OrgMap workspace={ws()} contact={contact('c8')} />);
    const map = screen.getByTestId('org-map');
    expect(map).toHaveTextContent('THIS CONTACT');
    expect(map).toHaveTextContent('Rachel Okonjo');
    expect(screen.getByTestId('org-node-c2')).toHaveTextContent('REPORTS TO THEM');
    expect(screen.getByTestId('org-node-c2')).toHaveTextContent('Marcus Bell');
    expect(rectXY('c2').y).toBeGreaterThan(rectXY('c8').y);
  });

  it('shows one hop each way and no further', () => {
    // Marcus's map has his manager, not his manager's other report.
    render(<OrgMap workspace={ws()} contact={contact('c2')} />);
    expect(screen.getByTestId('org-node-c8')).toHaveTextContent('MANAGER');
    expect(screen.queryByTestId('org-node-c6')).not.toBeInTheDocument();
  });

  it('opens the person a box stands for', () => {
    render(<OrgMap workspace={ws()} contact={contact('c8')} />);
    fireEvent.click(screen.getByTestId('org-node-c2'));
    expect(useStore.getState().view).toBe('contact');
    expect(useStore.getState().activeContactId).toBe('c2');
  });

  it('renders nodes at their hand-placed positions', () => {
    render(
      <OrgMap workspace={ws()} contact={contact('c2')} positions={{ c8: { x: 480, y: 12 } }} />,
    );
    expect(rectXY('c8')).toEqual({ x: 480, y: 12 });
  });

  it('moves a node and commits it once, without navigating', () => {
    const onMove = vi.fn();
    render(<OrgMap workspace={ws()} contact={contact('c2')} onMove={onMove} />);
    const start = rectXY('c8');
    drag('c8', [100, 100], [180, 150]);
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith('c8', start.x + 80, start.y + 50);
    // A drag is not a click: it must not navigate to the dragged person.
    expect(useStore.getState().view).toBe('home');
  });

  it('rubber-bands the edge while a node is being dragged', () => {
    render(<OrgMap workspace={ws()} contact={contact('c2')} onMove={vi.fn()} />);
    const before = edgePaths();
    const start = rectXY('c8');
    const node = screen.getByTestId('org-node-c8');
    pointer(node, 'pointerdown', { button: 0, clientX: 0, clientY: 0 });
    pointer(window, 'pointermove', { clientX: 200, clientY: 90, altKey: true });
    expect(rectXY('c8')).toEqual({ x: start.x + 200, y: start.y + 90 });
    expect(edgePaths()).not.toEqual(before);
    pointer(window, 'pointerup', { clientX: 200, clientY: 90 });
  });

  it('a small wobble is still a click, not a drag', () => {
    const onMove = vi.fn();
    render(<OrgMap workspace={ws()} contact={contact('c8')} onMove={onMove} />);
    drag('c2', [100, 100], [101, 101]);
    expect(onMove).not.toHaveBeenCalled();
    expect(useStore.getState().activeContactId).toBe('c2');
  });

  it('resizes the canvas and commits the height', () => {
    const onResize = vi.fn();
    render(<OrgMap workspace={ws()} contact={contact('c8')} onResize={onResize} />);
    const handle = screen.getByTestId('org-map-resize');
    pointer(handle, 'pointerdown', { button: 0, clientY: 200 });
    pointer(window, 'pointermove', { clientY: 320 });
    pointer(window, 'pointerup', { clientY: 320 });
    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize.mock.calls[0]?.[0]).toBeGreaterThan(140);
  });

  it('clamps the height to the map’s own bounds', () => {
    const onResize = vi.fn();
    render(<OrgMap workspace={ws()} contact={contact('c8')} onResize={onResize} />);
    const handle = screen.getByTestId('org-map-resize');
    pointer(handle, 'pointerdown', { button: 0, clientY: 500 });
    pointer(window, 'pointermove', { clientY: 0 });
    pointer(window, 'pointerup', { clientY: 0 });
    expect(onResize).toHaveBeenCalledWith(140);
  });

  it('hides the resize handle when the caller does not want one', () => {
    render(<OrgMap workspace={ws()} contact={contact('c8')} />);
    expect(screen.queryByTestId('org-map-resize')).not.toBeInTheDocument();
  });

  it('says so when there is no reporting line to draw', () => {
    // Dana Reyes has neither a manager nor reports in the seed.
    render(<OrgMap workspace={ws()} contact={contact('c1')} />);
    expect(screen.queryByTestId('org-map')).not.toBeInTheDocument();
    expect(screen.getByText(/No reporting line yet/)).toBeInTheDocument();
  });

  it('does not share an arrow marker with the dependency map', () => {
    // Two maps never share a page today, but a duplicate SVG marker id is the
    // kind of thing that only breaks once they do.
    render(<OrgMap workspace={ws()} contact={contact('c8')} />);
    expect(screen.getByTestId('org-map').querySelector('marker')?.id).toBe('org-arrow');
  });
});
