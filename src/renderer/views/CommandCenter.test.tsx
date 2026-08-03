import { seedWorkspace } from '@shared/domain/seed';
import { emptyWorkspace } from '@shared/types';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useStore } from '../app/store';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { loadTestWorkspace, setupTestApp, TEST_TODAY } from '../test-utils';

import { CommandCenter } from './CommandCenter';

beforeEach(() => {
  setupTestApp();
  loadTestWorkspace();
});

describe('CommandCenter', () => {
  it('renders the seeded daily review (stats, banner, focus sections)', () => {
    render(<CommandCenter />);

    // 3 overdue + 2 due today in the seed → headline count 5.
    expect(screen.getByTestId('home-headline')).toHaveTextContent(
      '5 tasks need your attention today',
    );
    expect(screen.getByTestId('ambient-banner')).toHaveTextContent('3 tasks overdue · 2 due today');

    expect(screen.getByTestId('focus-overdue')).toBeInTheDocument();
    expect(screen.getByTestId('focus-due-today')).toBeInTheDocument();
    expect(screen.getByTestId('focus-blocked')).toBeInTheDocument();
    expect(screen.getByTestId('focus-due-this-week')).toBeInTheDocument();
    expect(screen.getByTestId('focus-high-priority-later')).toBeInTheDocument();

    // Stat cards
    expect(screen.getByTestId('stat-open-tasks')).toHaveTextContent('23');
    expect(screen.getByTestId('stat-active-projects')).toHaveTextContent('6');
    expect(screen.getByTestId('stat-overdue')).toHaveTextContent('3');

    // Portfolio: all six project cards.
    expect(screen.getAllByTestId(/^project-card-/)).toHaveLength(6);
  });

  it('orders sections overdue → today → week → later → blocked', () => {
    render(<CommandCenter />);
    const ids = screen.getAllByTestId(/^focus-/).map((el) => el.getAttribute('data-testid'));
    expect(ids).toEqual([
      'focus-overdue',
      'focus-due-today',
      'focus-due-this-week',
      'focus-high-priority-later',
      'focus-blocked',
    ]);
  });

  it('excludes archived projects from stats, sections, and the portfolio', () => {
    const ws = seedWorkspace(TEST_TODAY);
    ws.projects = ws.projects.map((p) => (p.id === 'p1' ? { ...p, archived: true } : p));
    loadTestWorkspace(ws);
    render(<CommandCenter />);
    expect(screen.getAllByTestId(/^project-card-/)).toHaveLength(5);
    expect(screen.getByTestId('stat-active-projects')).toHaveTextContent('5');
    // p1's overdue "Migrate auth service" no longer counts or shows.
    expect(screen.getByTestId('stat-overdue')).toHaveTextContent('2');
    expect(
      within(screen.getByTestId('focus-overdue')).queryByText('Migrate auth service'),
    ).not.toBeInTheDocument();
  });

  it('due-this-week stops at Saturday; later-in-cycle high tasks move to high-later (D15)', () => {
    render(<CommandCenter />);
    // Today is Wed Jul 8; the week ends Sat Jul 11.
    const week = screen.getByTestId('focus-due-this-week');
    expect(within(week).getByText('Apply first coat of spar varnish')).toBeInTheDocument(); // Sat
    // "Meet with accountant" (Critical) is due Sun Jul 12 — next week, so it
    // surfaces under High priority · later instead.
    expect(within(week).queryByText('Meet with accountant')).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('focus-high-priority-later')).getByText('Meet with accountant'),
    ).toBeInTheDocument();
    // Stat card window: today (2) + Thu–Sat (5) = 7.
    expect(screen.getByTestId('stat-due-this-week')).toHaveTextContent('7');
  });

  it('lists the right tasks in the overdue section', () => {
    render(<CommandCenter />);
    const overdue = screen.getByTestId('focus-overdue');
    expect(within(overdue).getByText('Migrate auth service')).toBeInTheDocument();
    expect(within(overdue).getByText('Sand to 220 grit')).toBeInTheDocument();
    expect(within(overdue).getByText('Gather 1099s and receipts')).toBeInTheDocument();
  });

  it('filters everything by scope', async () => {
    render(<CommandCenter />);

    await userEvent.click(screen.getByRole('tab', { name: 'Home' }));
    // Home projects: boat table, taxes, network = 3 cards.
    expect(screen.getAllByTestId(/^project-card-/)).toHaveLength(3);
    const overdue = screen.getByTestId('focus-overdue');
    expect(within(overdue).queryByText('Migrate auth service')).not.toBeInTheDocument();
    expect(within(overdue).getByText('Sand to 220 grit')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Work' }));
    expect(screen.getAllByTestId(/^project-card-/)).toHaveLength(3);
    expect(
      within(screen.getByTestId('focus-overdue')).getByText('Migrate auth service'),
    ).toBeInTheDocument();
  });

  it('cycling a task status from a row updates the sections', async () => {
    render(<CommandCenter />);
    const overdue = screen.getByTestId('focus-overdue');
    // "Gather 1099s and receipts" is Doing; cycle → Waiting (still overdue),
    // so instead advance "Migrate auth service" (Todo → Doing) and assert the
    // row's circle interaction persists workspace changes.
    const row = within(overdue).getByText('Migrate auth service').closest('.trow');
    expect(row).not.toBeNull();
    await userEvent.click(within(row as HTMLElement).getByTitle(/Advance status/));
    const task = useStore
      .getState()
      .workspace?.tasks.find((t) => t.title === 'Migrate auth service');
    expect(task?.status).toBe('Doing');
  });

  it('shows the all-clear state on an empty workspace', () => {
    loadTestWorkspace(emptyWorkspace());
    render(<CommandCenter />);
    expect(screen.getByTestId('home-headline')).toHaveTextContent('Nothing urgent today');
    expect(screen.getByText('You are all caught up. 🎉')).toBeInTheDocument();
    expect(screen.queryByTestId('ambient-banner')).not.toBeInTheDocument();
  });

  it('hides the banner when nothing is overdue or critical today', () => {
    const ws = seedWorkspace(TEST_TODAY);
    ws.tasks = ws.tasks.map((t) => ({ ...t, dueDate: null }));
    loadTestWorkspace(ws);
    render(<CommandCenter />);
    expect(screen.queryByTestId('ambient-banner')).not.toBeInTheDocument();
  });
});

describe('CommandCenter bulk reschedule (D21)', () => {
  /** Open (not Done/Dropped) tasks past their due date — what the card lists. */
  const overdueIds = () => {
    const w = useStore.getState().workspace!;
    return w.tasks
      .filter(
        (t) =>
          t.status !== 'Done' &&
          t.status !== 'Dropped' &&
          t.dueDate !== null &&
          t.dueDate < TEST_TODAY,
      )
      .map((t) => t.id);
  };

  it('moves every overdue task to today after confirming', async () => {
    const before = overdueIds();
    expect(before.length).toBe(3);
    render(
      <>
        <CommandCenter />
        <ConfirmDialog />
      </>,
    );
    await userEvent.click(screen.getByTestId('reschedule-overdue'));

    const dialog = screen.getByRole('alertdialog', { name: 'Confirm' });
    expect(dialog).toHaveTextContent('Move 3 overdue tasks to today');
    // Not a deletion: the accept button says what it does.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reschedule' }));

    const w = useStore.getState().workspace!;
    for (const id of before) {
      expect(w.tasks.find((t) => t.id === id)?.dueDate).toBe(TEST_TODAY);
    }
    expect(useStore.getState().toast).toBe('Rescheduled 3 tasks for today');
    // The overdue card is gone now that nothing is overdue.
    expect(screen.queryByTestId('focus-overdue')).not.toBeInTheDocument();
  });

  it('cancelling changes nothing', async () => {
    const before = overdueIds();
    render(
      <>
        <CommandCenter />
        <ConfirmDialog />
      </>,
    );
    await userEvent.click(screen.getByTestId('reschedule-overdue'));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(overdueIds()).toEqual(before);
  });

  it('only the overdue card offers the button', () => {
    render(<CommandCenter />);
    expect(
      within(screen.getByTestId('focus-overdue')).getByTestId('reschedule-overdue'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('focus-due-today')).queryByTestId('reschedule-overdue'),
    ).not.toBeInTheDocument();
  });

  it('respects the Work/Home scope — a home report never reschedules work tasks', async () => {
    useStore.setState({ scope: 'home' });
    const workOverdue = useStore
      .getState()
      .workspace!.tasks.find((t) => t.title === 'Migrate auth service')!;
    render(
      <>
        <CommandCenter />
        <ConfirmDialog />
      </>,
    );
    await userEvent.click(screen.getByTestId('reschedule-overdue'));
    await userEvent.click(screen.getByRole('button', { name: 'Reschedule' }));
    const after = useStore.getState().workspace!.tasks.find((t) => t.id === workOverdue.id);
    expect(after?.dueDate).toBe(workOverdue.dueDate); // untouched
  });
});
