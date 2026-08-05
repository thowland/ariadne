import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useStore } from '../app/store';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { loadTestWorkspace, setupTestApp } from '../test-utils';

import { ProjectDetail } from './ProjectDetail';

beforeEach(() => {
  setupTestApp();
  loadTestWorkspace();
  useStore.setState({ view: 'project', activeProjectId: 'p3' });
});

function ws() {
  const w = useStore.getState().workspace;
  if (w === null) throw new Error('no workspace');
  return w;
}

describe('ProjectDetail', () => {
  it('renders header, sorted tasks, notes, and links', () => {
    render(<ProjectDetail />);
    expect(screen.getByLabelText('Project name')).toHaveValue('Refinish boat table');
    expect(screen.getByLabelText('Category')).toHaveValue('home');
    expect(screen.getByText('1 / 5 done')).toBeInTheDocument();
    expect(screen.getByText('#woodworking')).toBeInTheDocument();

    // Canonical order: Doing (sanding) first, Done (strip) last.
    const rows = screen.getAllByTitle(/Advance status/);
    expect(rows[0]).toHaveAttribute('title', 'Advance status (Doing)');
    expect(
      screen.getByDisplayValue('Teak table off the boat', { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('Varnish product')).toBeInTheDocument();
  });

  it('edits name, category, notes, and tags with auto-save', async () => {
    render(<ProjectDetail />);
    await userEvent.type(screen.getByLabelText('Project name'), '!');
    expect(ws().projects.find((p) => p.id === 'p3')?.name).toBe('Refinish boat table!');

    await userEvent.selectOptions(screen.getByLabelText('Category'), 'work');
    expect(ws().projects.find((p) => p.id === 'p3')?.category).toBe('work');

    const tagInput = screen.getByPlaceholderText('+ tag');
    await userEvent.type(tagInput, 'teak{Enter}');
    expect(ws().projects.find((p) => p.id === 'p3')?.tags).toEqual(['woodworking', 'teak']);

    await userEvent.click(screen.getByRole('button', { name: 'Remove tag woodworking' }));
    expect(ws().projects.find((p) => p.id === 'p3')?.tags).toEqual(['teak']);
  });

  it('keeps the task order pinned while statuses cycle', async () => {
    render(<ProjectDetail />);
    const titles = () =>
      screen
        .getAllByTitle(/Advance status/)
        .map((btn) => btn.closest('.trow')?.querySelector('.trow-title')?.textContent);
    const before = titles();
    expect(before[0]).toBe('Sand to 220 grit'); // Doing sorts first on entry

    // Doing → Waiting used to demote the row below every Todo; now it stays put.
    await userEvent.click(screen.getByTitle('Advance status (Doing)'));
    expect(ws().tasks.find((t) => t.title === 'Sand to 220 grit')?.status).toBe('Waiting');
    expect(titles()).toEqual(before);

    // …and further into Done, still pinned in place.
    await userEvent.click(screen.getByTitle('Advance status (Waiting)'));
    expect(titles()).toEqual(before);
  });

  it('quick-added tasks append at the end of the pinned order', async () => {
    render(<ProjectDetail />);
    const input = screen.getByPlaceholderText('Add a task and press Enter…');
    await userEvent.type(input, 'Buff the finish{Enter}');
    const titles = screen
      .getAllByTitle(/Advance status/)
      .map((btn) => btn.closest('.trow')?.querySelector('.trow-title')?.textContent);
    expect(titles[titles.length - 1]).toBe('Buff the finish');
  });

  it('archives and restores the project via the checkbox', async () => {
    render(<ProjectDetail />);
    const box = screen.getByLabelText('Archive this project');
    expect(box).not.toBeChecked();
    await userEvent.click(box);
    expect(ws().projects.find((p) => p.id === 'p3')?.archived).toBe(true);
    await userEvent.click(box);
    expect(ws().projects.find((p) => p.id === 'p3')?.archived).toBe(false);
  });

  it('quick-adds a task with Enter', async () => {
    render(<ProjectDetail />);
    const input = screen.getByPlaceholderText('Add a task and press Enter…');
    await userEvent.type(input, 'Buy more sandpaper{Enter}');
    expect(input).toHaveValue('');
    const added = ws().tasks.find((t) => t.title === 'Buy more sandpaper');
    expect(added).toMatchObject({ projectId: 'p3', status: 'Todo', priority: 'Medium' });
    // Appears in the task list (and possibly the dependency map as a lone node).
    expect(screen.getAllByText('Buy more sandpaper').length).toBeGreaterThanOrEqual(1);
  });

  it('+ Add task creates an empty task and opens the editor', async () => {
    render(<ProjectDetail />);
    await userEvent.click(screen.getByRole('button', { name: '+ Add task' }));
    const modal = useStore.getState().modal;
    expect(modal?.type).toBe('task');
    const modalId = modal !== null && modal.type === 'task' ? modal.id : null;
    expect(ws().tasks.find((t) => t.id === modalId)?.projectId).toBe('p3');
  });

  it('edits links inline', async () => {
    render(<ProjectDetail />);
    await userEvent.click(screen.getByRole('button', { name: '+ Add link' }));
    const labels = screen.getAllByPlaceholderText('Label');
    await userEvent.type(labels[labels.length - 1]!, 'Teak oil');
    const p3 = ws().projects.find((p) => p.id === 'p3');
    expect(p3?.links[1]).toMatchObject({ title: 'Teak oil' });
  });

  it('deletes the project after confirm, cascading tasks', async () => {
    render(
      <>
        <ProjectDetail />
        <ConfirmDialog />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Confirm' });
    expect(dialog).toHaveTextContent('Delete this project and all its tasks?');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(ws().projects.some((p) => p.id === 'p3')).toBe(false);
    expect(ws().tasks.some((t) => t.projectId === 'p3')).toBe(false);
    expect(useStore.getState().view).toBe('home');
  });

  it('cancelling the confirm keeps the project', async () => {
    render(
      <>
        <ProjectDetail />
        <ConfirmDialog />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(ws().projects.some((p) => p.id === 'p3')).toBe(true);
    expect(useStore.getState().view).toBe('project');
  });

  it('persists dependency-map drags and resets them on demand', async () => {
    useStore.setState({ activeProjectId: 'p1' }); // p1 is the project with a dep graph
    render(<ProjectDetail />);
    expect(screen.queryByRole('button', { name: 'Reset layout' })).not.toBeInTheDocument();

    const node = screen.getByTestId('dep-node-t3');
    const down = new MouseEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientX: 0,
      clientY: 0,
    });
    fireEvent(node, down);
    fireEvent(window, new MouseEvent('pointermove', { bubbles: true, clientX: 90, clientY: 40 }));
    fireEvent(window, new MouseEvent('pointerup', { bubbles: true, clientX: 90, clientY: 40 }));

    const placed = ws().projects.find((p) => p.id === 'p1')?.depLayout?.t3;
    expect(placed).toBeDefined();
    // Node stays where it was dropped across a re-render.
    expect(screen.getByTestId('dep-node-t3').querySelector('rect')).toHaveAttribute(
      'x',
      String(placed?.x),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Reset layout' }));
    expect(ws().projects.find((p) => p.id === 'p1')?.depLayout).toEqual({});
  });

  it('persists the dependency-map height', async () => {
    useStore.setState({ activeProjectId: 'p1' });
    render(<ProjectDetail />);
    screen.getByTestId('dep-map-resize').focus();
    await userEvent.keyboard('{ArrowDown}');
    const h = ws().projects.find((p) => p.id === 'p1')?.depMapHeight;
    expect(h).toBeGreaterThan(160);
    expect(screen.getByTestId('dependency-map')).toHaveStyle({ height: `${String(h)}px` });
  });

  it('offers a drop zone in the files card that files uploads under this project', async () => {
    render(<ProjectDetail />);
    const zone = screen.getByTestId('upload-dropzone');
    expect(zone).toBeInTheDocument();

    fireEvent.drop(zone, {
      dataTransfer: { files: [new File(['x'], 'plan.pdf', { type: 'application/pdf' })] },
    });
    await waitFor(() => {
      expect(ws().files.at(-1)).toMatchObject({ projectId: 'p3', name: 'plan.pdf' });
    });
  });

  it('shows a not-found stub for a missing project', () => {
    useStore.setState({ activeProjectId: 'ghost' });
    render(<ProjectDetail />);
    expect(screen.getByText('Project not found.')).toBeInTheDocument();
  });
});
