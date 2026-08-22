import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useStore } from '../app/store';
import { loadTestWorkspace, setupTestApp } from '../test-utils';

import { ContextMenu } from './ContextMenu';
import { DependencyMap } from './DependencyMap';

beforeEach(() => {
  setupTestApp();
  loadTestWorkspace();
});

function projectTasks(pid: string) {
  const w = useStore.getState().workspace;
  if (w === null) throw new Error('no workspace');
  return w.tasks.filter((t) => t.projectId === pid);
}

describe('DependencyMap', () => {
  it('renders status-labelled nodes and edges for the migration project', () => {
    render(<DependencyMap tasks={projectTasks('p1')} />);
    const map = screen.getByTestId('dependency-map');
    expect(map).toBeInTheDocument();
    // All six p1 tasks are live (none Dropped) → six nodes.
    expect(map.querySelectorAll('g.node-map-node')).toHaveLength(6);
    expect(screen.getByTestId('dep-node-t5')).toHaveTextContent('Waiting');
    expect(screen.getByTestId('dep-node-t5')).toHaveTextContent('Cutover & DNS switch');
    // 5 dependency edges in the seed graph for p1 (b←a, c←b, e←b, cutover←c,e).
    expect(map.querySelectorAll('path[marker-end]')).toHaveLength(5);
  });

  it('truncates long titles', () => {
    render(<DependencyMap tasks={projectTasks('p1')} />);
    expect(screen.getByTestId('dep-node-t1')).toHaveTextContent('Audit legacy service …');
  });

  it('opens the task modal when a node is clicked', async () => {
    render(<DependencyMap tasks={projectTasks('p1')} />);
    await userEvent.click(screen.getByTestId('dep-node-t3'));
    expect(useStore.getState().modal).toEqual({ type: 'task', id: 't3' });
  });

  it('shows the empty-state hint when nothing is mapped', () => {
    render(<DependencyMap tasks={[]} />);
    expect(screen.getByText(/No dependencies mapped yet/)).toBeInTheDocument();
    expect(screen.queryByTestId('dependency-map')).not.toBeInTheDocument();
  });
});

/** Node origin, read off the rendered rect. */
function rectXY(id: string): { x: number; y: number } {
  const rect = screen.getByTestId(`dep-node-${id}`).querySelector('rect');
  if (rect === null) throw new Error(`no rect for ${id}`);
  return { x: Number(rect.getAttribute('x')), y: Number(rect.getAttribute('y')) };
}

function edgePaths(): string[] {
  return [...screen.getByTestId('dependency-map').querySelectorAll('path[marker-end]')].map(
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
  const node = screen.getByTestId(`dep-node-${id}`);
  pointer(node, 'pointerdown', { button: 0, clientX: from[0], clientY: from[1] });
  pointer(window, 'pointermove', { clientX: to[0], clientY: to[1] });
  pointer(window, 'pointerup', { clientX: to[0], clientY: to[1] });
  fireEvent.click(node);
}

describe('DependencyMap dragging', () => {
  it('renders nodes at their hand-placed positions', () => {
    render(<DependencyMap tasks={projectTasks('p1')} positions={{ t3: { x: 500, y: 400 } }} />);
    expect(rectXY('t3')).toEqual({ x: 500, y: 400 });
  });

  it('moves a node and commits the new position once, without opening the task', () => {
    const onMove = vi.fn();
    render(<DependencyMap tasks={projectTasks('p1')} onMove={onMove} />);
    const start = rectXY('t3');
    drag('t3', [100, 100], [160, 190]);
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith('t3', start.x + 60, start.y + 90);
    // A drag is not a click: the task editor stays shut.
    expect(useStore.getState().modal).toBeNull();
  });

  it('rubber-bands the edges while a node is being dragged', () => {
    render(<DependencyMap tasks={projectTasks('p1')} onMove={vi.fn()} />);
    const before = edgePaths();
    const start = rectXY('t3');
    const node = screen.getByTestId('dep-node-t3');
    pointer(node, 'pointerdown', { button: 0, clientX: 0, clientY: 0 });
    pointer(window, 'pointermove', { clientX: 240, clientY: 260 });
    // The node follows the pointer before the drag is committed…
    expect(rectXY('t3')).toEqual({ x: start.x + 240, y: start.y + 260 });
    // …and so do the edges, which is the whole point of the rubber band.
    expect(edgePaths()).not.toEqual(before);
    pointer(window, 'pointerup', { clientX: 240, clientY: 260 });
  });

  it('clamps a node dragged past the top-left corner', () => {
    const onMove = vi.fn();
    render(<DependencyMap tasks={projectTasks('p1')} onMove={onMove} />);
    drag('t3', [500, 500], [0, 0]);
    expect(onMove).toHaveBeenCalledWith('t3', 0, 0);
  });

  it('treats a jitter-free press as a click and still opens the task', () => {
    const onMove = vi.fn();
    render(<DependencyMap tasks={projectTasks('p1')} onMove={onMove} />);
    drag('t3', [100, 100], [101, 100]);
    expect(onMove).not.toHaveBeenCalled();
    expect(useStore.getState().modal).toEqual({ type: 'task', id: 't3' });
  });

  it('ignores non-primary buttons', () => {
    const onMove = vi.fn();
    render(<DependencyMap tasks={projectTasks('p1')} onMove={onMove} />);
    const node = screen.getByTestId('dep-node-t3');
    pointer(node, 'pointerdown', { button: 2, clientX: 0, clientY: 0 });
    pointer(window, 'pointermove', { clientX: 200, clientY: 200 });
    pointer(window, 'pointerup', { clientX: 200, clientY: 200 });
    expect(onMove).not.toHaveBeenCalled();
  });

  it('has no drag handles when no onMove is supplied', () => {
    render(<DependencyMap tasks={projectTasks('p1')} />);
    expect(screen.getByTestId('dep-node-t3')).not.toHaveClass('draggable');
  });
});

describe('DependencyMap resizing', () => {
  it('shows no resize handle unless onResize is supplied', () => {
    render(<DependencyMap tasks={projectTasks('p1')} />);
    expect(screen.queryByTestId('dependency-map-resize')).not.toBeInTheDocument();
  });

  it('applies a saved height, clamped to the allowed range', () => {
    const { rerender } = render(<DependencyMap tasks={projectTasks('p1')} height={480} />);
    expect(screen.getByTestId('dependency-map')).toHaveStyle({ height: '480px' });
    rerender(<DependencyMap tasks={projectTasks('p1')} height={10} />);
    expect(screen.getByTestId('dependency-map')).toHaveStyle({ height: '160px' });
  });

  it('drags the handle to a new height and commits on release', () => {
    const onResize = vi.fn();
    render(<DependencyMap tasks={projectTasks('p1')} height={300} onResize={onResize} />);
    const handle = screen.getByTestId('dependency-map-resize');
    pointer(handle, 'pointerdown', { button: 0, clientY: 100 });
    pointer(window, 'pointermove', { clientY: 250 });
    expect(screen.getByTestId('dependency-map')).toHaveStyle({ height: '450px' });
    pointer(window, 'pointerup', { clientY: 250 });
    expect(onResize).toHaveBeenCalledWith(450);
  });

  it('resizes by keyboard from the handle', async () => {
    const onResize = vi.fn();
    render(<DependencyMap tasks={projectTasks('p1')} height={300} onResize={onResize} />);
    screen.getByTestId('dependency-map-resize').focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(onResize).toHaveBeenCalledWith(340);
    await userEvent.keyboard('{ArrowUp}');
    expect(onResize).toHaveBeenLastCalledWith(260);
  });
});

describe('DependencyMap linking (D37)', () => {
  /** Drop `id` onto the centre of `onto`, reading positions from the layout. */
  function dropOnto(id: string, onto: string): void {
    const from = rectXY(id);
    const to = rectXY(onto);
    const node = screen.getByTestId(`dep-node-${id}`);
    pointer(node, 'pointerdown', { button: 0, clientX: 0, clientY: 0 });
    pointer(window, 'pointermove', { clientX: to.x - from.x, clientY: to.y - from.y });
    pointer(window, 'pointerup', { clientX: to.x - from.x, clientY: to.y - from.y });
    fireEvent.click(node);
  }

  it('a drop onto another box links instead of placing', () => {
    const onLink = vi.fn();
    const onMove = vi.fn();
    render(<DependencyMap tasks={projectTasks('p1')} onMove={onMove} onLink={onLink} />);
    dropOnto('t6', 't1');
    expect(onLink).toHaveBeenCalledWith('t6', 't1');
    // The two are alternatives: a link is not also a hand-placement.
    expect(onMove).not.toHaveBeenCalled();
  });

  it('a drop into empty space still just moves the box', () => {
    const onLink = vi.fn();
    const onMove = vi.fn();
    render(<DependencyMap tasks={projectTasks('p1')} onMove={onMove} onLink={onLink} />);
    drag('t6', [0, 0], [600, 600]);
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onLink).not.toHaveBeenCalled();
  });

  it('highlights the box under the dragged one, and clears it again', () => {
    render(<DependencyMap tasks={projectTasks('p1')} onMove={vi.fn()} onLink={vi.fn()} />);
    const from = rectXY('t6');
    const to = rectXY('t1');
    const node = screen.getByTestId('dep-node-t6');
    pointer(node, 'pointerdown', { button: 0, clientX: 0, clientY: 0 });
    pointer(window, 'pointermove', { clientX: to.x - from.x, clientY: to.y - from.y });
    expect(screen.getByTestId('dep-node-t1').getAttribute('class')).toContain('drop-target');

    pointer(window, 'pointermove', { clientX: 900, clientY: 900 });
    expect(screen.getByTestId('dep-node-t1').getAttribute('class')).not.toContain('drop-target');
    pointer(window, 'pointerup', { clientX: 900, clientY: 900 });
  });

  it('does nothing on a drop when the caller has not asked for linking', () => {
    const onMove = vi.fn();
    render(<DependencyMap tasks={projectTasks('p1')} onMove={onMove} />);
    dropOnto('t6', 't1');
    // Without onLink a drop is an ordinary placement, wherever it lands.
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it('right-clicking a line offers to remove that dependency', async () => {
    const onUnlink = vi.fn();
    render(
      <>
        <DependencyMap tasks={projectTasks('p1')} onUnlink={onUnlink} />
        <ContextMenu />
      </>,
    );
    // t2 "Provision new k8s cluster" waits on t1 "Audit legacy…".
    fireEvent.contextMenu(screen.getByTestId('edge-t1-t2'), { clientX: 40, clientY: 40 });
    const menu = screen.getByRole('menu');
    expect(menu).toHaveAccessibleName(/Audit legacy service dependencies →/);

    await userEvent.click(within(menu).getByText('Remove this dependency'));
    expect(onUnlink).toHaveBeenCalledWith('t2', 't1');
  });

  it('offers no line menu when the caller has not asked for one', () => {
    render(<DependencyMap tasks={projectTasks('p1')} />);
    expect(screen.queryByTestId('edge-t1-t2')).not.toBeInTheDocument();
  });
});
