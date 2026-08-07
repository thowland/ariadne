import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useStore } from '../app/store';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ContextMenu } from '../components/ContextMenu';
import { loadTestWorkspace, setupTestApp, TEST_TODAY } from '../test-utils';

import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

beforeEach(() => {
  setupTestApp();
  loadTestWorkspace();
});

describe('Sidebar', () => {
  it('shows the overdue badge on Command Center and per-project counts', () => {
    render(<Sidebar />);
    // 3 seeded overdue tasks → badge.
    expect(screen.getByRole('button', { name: /Command Center/ })).toHaveTextContent('3');
    // p1 has 1 overdue → red count 1; p2 has 4 open, none overdue.
    expect(screen.getByRole('button', { name: /Q3 Platform Migration/ })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /Customer Onboarding Revamp/ })).toHaveTextContent(
      '4',
    );
  });

  it('marks the active view and project', async () => {
    render(<Sidebar />);
    expect(screen.getByRole('button', { name: /Command Center/ })).toHaveClass('active');
    await userEvent.click(screen.getByRole('button', { name: /2025 Taxes/ }));
    expect(screen.getByRole('button', { name: /2025 Taxes/ })).toHaveClass('active');
    expect(useStore.getState().activeProjectId).toBe('p4');
  });

  it('navigates to the Files and Tags views', async () => {
    render(<Sidebar />);
    await userEvent.click(screen.getByRole('button', { name: 'Files' }));
    expect(useStore.getState().view).toBe('files');
    await userEvent.click(screen.getByRole('button', { name: 'Tags' }));
    expect(useStore.getState().view).toBe('tags');
  });

  it('hides archived projects behind a collapsible Archived section', async () => {
    const ws = useStore.getState().workspace!;
    useStore.setState({
      workspace: {
        ...ws,
        projects: ws.projects.map((p) => (p.id === 'p1' ? { ...p, archived: true } : p)),
      },
    });
    render(<Sidebar />);
    // Out of the main list; overdue badge drops p1's overdue task (3 → 2).
    expect(screen.queryByRole('button', { name: /Q3 Platform Migration/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Command Center/ })).toHaveTextContent('2');

    await userEvent.click(screen.getByRole('button', { name: /ARCHIVED \(1\)/ }));
    await userEvent.click(screen.getByRole('button', { name: /Q3 Platform Migration/ }));
    expect(useStore.getState().activeProjectId).toBe('p1');
  });
});

describe('TopBar', () => {
  it('shows the view title, date, and overdue pill', () => {
    render(<TopBar />);
    expect(screen.getByText('Command Center')).toBeInTheDocument();
    expect(screen.getByText('Wednesday, July 8, 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /3 overdue/ })).toBeInTheDocument();
  });

  it('overdue pill jumps home with scope all', async () => {
    useStore.setState({ view: 'calendar', scope: 'home' });
    render(<TopBar />);
    await userEvent.click(screen.getByRole('button', { name: /3 overdue/ }));
    expect(useStore.getState().view).toBe('home');
    expect(useStore.getState().scope).toBe('all');
  });

  it('titles the project view with the project name', () => {
    useStore.setState({ view: 'project', activeProjectId: 'p3' });
    render(<TopBar />);
    expect(screen.getByText('Refinish boat table')).toBeInTheDocument();
  });

  it('titles search results while a query is active', () => {
    useStore.setState({ q: 'varnish' });
    render(<TopBar />);
    expect(screen.getByText('Search results')).toBeInTheDocument();
  });

  it('AI import button opens the wizard modal', async () => {
    render(<TopBar />);
    await userEvent.click(screen.getByRole('button', { name: 'AI import…' }));
    expect(useStore.getState().modal).toEqual({ type: 'aiImport' });
  });

  it('New project creates a project and opens it', async () => {
    const before = useStore.getState().workspace!.projects.length;
    render(<TopBar />);
    await userEvent.click(screen.getByRole('button', { name: '+ New project' }));
    const state = useStore.getState();
    expect(state.workspace!.projects).toHaveLength(before + 1);
    // Same destination as the sidebar's + button: the new project's screen.
    expect(state.view).toBe('project');
    expect(state.activeProjectId).not.toBeNull();
  });
});

describe('Sidebar — drag to reorder projects', () => {
  function projectOrder() {
    return (useStore.getState().workspace?.projects ?? []).map((p) => p.id);
  }

  it('dropping a project on another reorders and persists', () => {
    render(<Sidebar />);
    const source = screen.getByRole('button', { name: /Home network upgrade/ });
    const target = screen.getByRole('button', { name: /Q3 Platform Migration/ });

    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: () => undefined,
      getData: () => 'p6',
    };
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    expect(target).toHaveClass('drag-over');
    fireEvent.drop(target, { dataTransfer });

    expect(projectOrder()).toEqual(['p6', 'p1', 'p2', 'p3', 'p4', 'p5']);
    expect(window.ariadne.saveCollections).toHaveBeenCalledWith({
      projects: useStore.getState().workspace?.projects,
    });
  });

  it('dropping on itself and dragend clean up without changes', () => {
    render(<Sidebar />);
    const source = screen.getByRole('button', { name: /2025 Taxes/ });
    const dataTransfer = { effectAllowed: '', dropEffect: '', setData: () => undefined };
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragOver(source, { dataTransfer });
    expect(source).not.toHaveClass('drag-over');
    fireEvent.drop(source, { dataTransfer });
    expect(projectOrder()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);

    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragEnd(source, { dataTransfer });
    const other = screen.getByRole('button', { name: /Refinish boat table/ });
    fireEvent.drop(other, { dataTransfer }); // no active drag → no move
    expect(projectOrder()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
  });

  it('dropping a project on the archive zone archives it', () => {
    render(<Sidebar />);
    const source = screen.getByRole('button', { name: /Home network upgrade/ });
    const dataTransfer = { effectAllowed: '', dropEffect: '', setData: () => undefined };

    fireEvent.dragStart(source, { dataTransfer });
    const zone = screen.getByTestId('archive-drop');
    expect(zone).toHaveTextContent('DROP TO ARCHIVE');
    fireEvent.dragOver(zone, { dataTransfer });
    expect(zone).toHaveClass('drag-over');
    fireEvent.drop(zone, { dataTransfer });

    expect(useStore.getState().workspace?.projects.find((p) => p.id === 'p6')?.archived).toBe(true);
    expect(screen.queryByRole('button', { name: /Home network upgrade/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('archive-drop')).toHaveTextContent('ARCHIVED (1)');
  });
});

/** Right-click a project row and read back the menu that opens. */
async function openProjectMenu(name: RegExp | string): Promise<HTMLElement> {
  fireEvent.contextMenu(screen.getByRole('button', { name }));
  return screen.findByRole('menu');
}

describe('Sidebar project context menu (D21)', () => {
  function ws() {
    const w = useStore.getState().workspace;
    if (w === null) throw new Error('no workspace');
    return w;
  }

  it('archives and restores a project without leaving the sidebar', async () => {
    render(
      <>
        <Sidebar />
        <ContextMenu />
      </>,
    );
    const menu = await openProjectMenu(/Q3 Platform Migration/);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Archive project' }));
    expect(ws().projects.find((p) => p.id === 'p1')?.archived).toBe(true);
    expect(useStore.getState().toast).toBe('Q3 Platform Migration archived');
    // The menu closes behind the action.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    // It now lives under ARCHIVED, where the menu offers the reverse.
    await userEvent.click(screen.getByRole('button', { name: /ARCHIVED/ }));
    const back = await openProjectMenu(/Q3 Platform Migration/);
    await userEvent.click(within(back).getByRole('menuitem', { name: 'Restore from archive' }));
    expect(ws().projects.find((p) => p.id === 'p1')?.archived).toBe(false);
  });

  it('opens the bulk move picker seeded with the project’s tasks', async () => {
    render(
      <>
        <Sidebar />
        <ContextMenu />
      </>,
    );
    const menu = await openProjectMenu(/Q3 Platform Migration/);
    await userEvent.click(within(menu).getByRole('menuitem', { name: /Move 6 tasks to project/ }));
    const modal = useStore.getState().modal;
    expect(modal).toMatchObject({ type: 'moveTasks', fromProjectId: 'p1' });
    expect(modal?.type === 'moveTasks' && modal.taskIds).toHaveLength(6);
  });

  it('reschedules only that project’s overdue tasks', async () => {
    render(
      <>
        <Sidebar />
        <ContextMenu />
      </>,
    );
    const otherOverdue = ws().tasks.find(
      (t) => t.projectId !== 'p1' && t.title === 'Sand to 220 grit',
    );
    const menu = await openProjectMenu(/Q3 Platform Migration/);
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Reschedule 1 overdue for today' }),
    );
    expect(ws().tasks.find((t) => t.title === 'Migrate auth service')?.dueDate).toBe(TEST_TODAY);
    // Another project's overdue task is untouched.
    expect(ws().tasks.find((t) => t.id === otherOverdue?.id)?.dueDate).toBe(otherOverdue?.dueDate);
  });

  it('disables actions that have nothing to act on', async () => {
    // Customer Onboarding (p2) has 4 open tasks and none overdue in the seed.
    render(
      <>
        <Sidebar />
        <ContextMenu />
      </>,
    );
    const menu = await openProjectMenu(/Customer Onboarding Revamp/);
    expect(within(menu).getByRole('menuitem', { name: /Reschedule 0 overdue/ })).toBeDisabled();
  });

  it('creates a task in the project and opens it', async () => {
    render(
      <>
        <Sidebar />
        <ContextMenu />
      </>,
    );
    const before = ws().tasks.length;
    const menu = await openProjectMenu(/Q3 Platform Migration/);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'New task in this project' }));
    expect(ws().tasks).toHaveLength(before + 1);
    const modal = useStore.getState().modal;
    expect(modal?.type).toBe('task');
    const id = modal?.type === 'task' ? modal.id : null;
    expect(ws().tasks.find((t) => t.id === id)?.projectId).toBe('p1');
  });

  it('deletes a project only after the confirm', async () => {
    render(
      <>
        <Sidebar />
        <ContextMenu />
        <ConfirmDialog />
      </>,
    );
    const menu = await openProjectMenu(/Q3 Platform Migration/);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Delete project…' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Confirm' });
    expect(dialog).toHaveTextContent('Its 6 tasks and files go too');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(ws().projects.some((p) => p.id === 'p1')).toBe(true);

    const again = await openProjectMenu(/Q3 Platform Migration/);
    await userEvent.click(within(again).getByRole('menuitem', { name: 'Delete project…' }));
    await userEvent.click(
      within(screen.getByRole('alertdialog', { name: 'Confirm' })).getByRole('button', {
        name: 'Delete',
      }),
    );
    expect(ws().projects.some((p) => p.id === 'p1')).toBe(false);
    expect(ws().tasks.some((t) => t.projectId === 'p1')).toBe(false);
  });
});
