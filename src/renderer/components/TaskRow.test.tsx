import { seedWorkspace } from '@shared/domain/seed';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useStore } from '../app/store';
import { loadTestWorkspace, setupTestApp, TEST_TODAY } from '../test-utils';

import { ConfirmDialog } from './ConfirmDialog';
import { ContextMenu } from './ContextMenu';
import { TaskRow } from './TaskRow';

beforeEach(() => {
  setupTestApp();
  loadTestWorkspace();
});

function task(id: string): NonNullable<ReturnType<typeof find>> {
  const t = find(id);
  if (t === undefined) throw new Error(`no task ${id}`);
  return t;
}
function find(id: string) {
  return useStore.getState().workspace?.tasks.find((t) => t.id === id);
}

describe('TaskRow', () => {
  it('shows title, project line, and relative due label', () => {
    // t3 = "Migrate auth service", overdue by 1 day, blocked by t2.
    render(<TaskRow task={task('t3')} showProject />);
    expect(screen.getByText('Migrate auth service')).toBeInTheDocument();
    expect(screen.getByText('Q3 Platform Migration')).toBeInTheDocument();
    expect(screen.getByText('1d overdue')).toBeInTheDocument();
    expect(screen.getByText('blocked')).toBeInTheDocument();
  });

  it('suppresses the priority dot while blocked, shows it otherwise', () => {
    render(<TaskRow task={task('t3')} />);
    expect(screen.queryByTitle('Critical priority')).not.toBeInTheDocument();

    // t12 (2025 Taxes → "Gather 1099s") is High and not blocked.
    const gather = useStore
      .getState()
      .workspace!.tasks.find((t) => t.title === 'Gather 1099s and receipts')!;
    render(<TaskRow task={gather} />);
    expect(screen.getByTitle('High priority')).toBeInTheDocument();
  });

  it('strikes through Done tasks', () => {
    const done = useStore.getState().workspace!.tasks.find((t) => t.status === 'Done')!;
    render(<TaskRow task={done} />);
    expect(screen.getByText(done.title)).toHaveClass('done');
  });

  it('never labels a Done task overdue — neutral date instead', () => {
    // Seed: "Strip old varnish" is Done with a due date 6 days back (Jul 2).
    const done = useStore.getState().workspace!.tasks.find((t) => t.title === 'Strip old varnish')!;
    render(<TaskRow task={done} />);
    expect(screen.queryByText(/overdue/)).not.toBeInTheDocument();
    expect(screen.getByText('Jul 2')).toBeInTheDocument();
  });

  it('cycles status via the circle without opening the task', async () => {
    render(<TaskRow task={task('t3')} />);
    await userEvent.click(screen.getByTitle('Advance status (Todo)'));
    expect(find('t3')?.status).toBe('Doing');
    // Row click did not fire → still on home view.
    expect(useStore.getState().view).toBe('home');
  });

  it('opens the task editor modal on row click', async () => {
    render(<TaskRow task={task('t3')} />);
    await userEvent.click(screen.getByText('Migrate auth service'));
    expect(useStore.getState().modal).toEqual({ type: 'task', id: 't3' });
  });

  it('renders "Untitled task" for empty titles', () => {
    const ws = seedWorkspace(TEST_TODAY);
    const t = { ...ws.tasks[0]!, id: 'blank', title: '' };
    loadTestWorkspace({ ...ws, tasks: [...ws.tasks, t] });
    render(<TaskRow task={t} />);
    expect(screen.getByText('Untitled task')).toBeInTheDocument();
  });
});

describe('TaskRow context menu (D21)', () => {
  const TOMORROW = '2026-07-09';

  /**
   * Re-reads the task from the store on every render, the way the real views
   * do — a row holding a snapshot would build its second menu from stale data.
   */
  function LiveRow({ id, showProject }: { id: string; showProject?: boolean }) {
    const t = useStore((s) => s.workspace?.tasks.find((x) => x.id === id));
    return t === undefined ? null : <TaskRow task={t} showProject={showProject} />;
  }

  async function openMenu(id: string, showProject = false): Promise<HTMLElement> {
    render(
      <>
        <LiveRow id={id} showProject={showProject} />
        <ContextMenu />
        <ConfirmDialog />
      </>,
    );
    fireEvent.contextMenu(screen.getByText(task(id).title));
    return screen.findByRole('menu');
  }

  it('schedules for today and for tomorrow', async () => {
    const menu = await openMenu('t3'); // overdue "Migrate auth service"
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Due today' }));
    expect(find('t3')?.dueDate).toBe(TEST_TODAY);
    expect(useStore.getState().toast).toBe('Due today');

    fireEvent.contextMenu(screen.getByText(task('t3').title));
    const again = await screen.findByRole('menu');
    await userEvent.click(within(again).getByRole('menuitem', { name: 'Due tomorrow' }));
    expect(find('t3')?.dueDate).toBe(TOMORROW);
  });

  it('greys out the date it is already on', async () => {
    const menu = await openMenu('t3');
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Due today' }));
    fireEvent.contextMenu(screen.getByText(task('t3').title));
    const again = await screen.findByRole('menu');
    expect(within(again).getByRole('menuitem', { name: 'Due today' })).toBeDisabled();
    expect(within(again).getByRole('menuitem', { name: 'Due tomorrow' })).toBeEnabled();
  });

  it('clears a due date', async () => {
    const menu = await openMenu('t3');
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Clear due date' }));
    expect(find('t3')?.dueDate).toBeNull();
  });

  it('marks complete, stamping completedAt, then reopens', async () => {
    const menu = await openMenu('t3');
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Mark complete' }));
    expect(find('t3')).toMatchObject({ status: 'Done', completedAt: TEST_TODAY });

    fireEvent.contextMenu(screen.getByText(task('t3').title));
    const again = await screen.findByRole('menu');
    await userEvent.click(within(again).getByRole('menuitem', { name: 'Reopen (back to Todo)' }));
    expect(find('t3')).toMatchObject({ status: 'Todo', completedAt: null });
  });

  it('drops a task', async () => {
    const menu = await openMenu('t3');
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Drop task' }));
    expect(find('t3')?.status).toBe('Dropped');
  });

  it('opens the move picker for just this task', async () => {
    const menu = await openMenu('t3');
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Move to project…' }));
    expect(useStore.getState().modal).toMatchObject({
      type: 'moveTasks',
      taskIds: ['t3'],
      fromProjectId: 'p1',
    });
  });

  it('offers "go to project" only where the project line is shown', async () => {
    const withProject = await openMenu('t3', true);
    expect(
      within(withProject).getByRole('menuitem', { name: /Go to Q3 Platform Migration/ }),
    ).toBeInTheDocument();
    cleanup();

    const without = await openMenu('t3');
    expect(within(without).queryByRole('menuitem', { name: /^Go to/ })).not.toBeInTheDocument();
  });

  it('deletes only after the confirm', async () => {
    const menu = await openMenu('t3');
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Delete task…' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Confirm' });
    expect(dialog).toHaveTextContent('Migrate auth service');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(find('t3')).toBeDefined();

    fireEvent.contextMenu(screen.getByText(task('t3').title));
    const again = await screen.findByRole('menu');
    await userEvent.click(within(again).getByRole('menuitem', { name: 'Delete task…' }));
    await userEvent.click(
      within(screen.getByRole('alertdialog', { name: 'Confirm' })).getByRole('button', {
        name: 'Delete',
      }),
    );
    expect(find('t3')).toBeUndefined();
  });

  it('right-clicking a row does not also open the task editor', async () => {
    await openMenu('t3');
    expect(useStore.getState().modal).toBeNull();
  });
});
