import { seedWorkspace } from '@shared/domain/seed';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useStore } from '../app/store';
import { loadTestWorkspace, setupTestApp, TEST_TODAY } from '../test-utils';

import { Calendar } from './Calendar';

beforeEach(() => {
  setupTestApp();
  loadTestWorkspace();
  useStore.setState({ view: 'calendar' });
});

describe('Calendar', () => {
  it('renders the current month with seeded chips and the upcoming list', () => {
    render(<Calendar />);
    expect(screen.getByRole('heading', { name: 'July 2026' })).toBeInTheDocument();

    const grid = screen.getByTestId('calendar-grid');
    // Today (Jul 8): runbook + wireframes due.
    expect(within(grid).getByTitle('Write migration runbook')).toBeInTheDocument();
    expect(within(grid).getByTitle('New onboarding wireframes')).toBeInTheDocument();
    // Done task appears struck (chip present) — due Jul 2 in the seed.
    expect(within(grid).getByTitle('Strip old varnish')).toHaveClass('done');

    // Upcoming lists open dated tasks from today forward, capped at 10.
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
    expect(screen.getAllByTitle(/Advance status/).length).toBeLessThanOrEqual(10);
  });

  it('pages months and returns via Today', async () => {
    render(<Calendar />);
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('heading', { name: 'August 2026' })).toBeInTheDocument();
    expect(useStore.getState().calMonth).toBe('2026-08');

    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByRole('heading', { name: 'June 2026' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(screen.getByRole('heading', { name: 'July 2026' })).toBeInTheDocument();
    expect(useStore.getState().calMonth).toBeNull();
  });

  it('filters chips by scope', async () => {
    render(<Calendar />);
    await userEvent.click(screen.getByRole('tab', { name: 'Home' }));
    const grid = screen.getByTestId('calendar-grid');
    expect(within(grid).queryByTitle('Write migration runbook')).not.toBeInTheDocument();
    expect(within(grid).getByTitle('Sand to 220 grit')).toBeInTheDocument();
  });

  it('opens the task modal from a chip', async () => {
    render(<Calendar />);
    await userEvent.click(
      within(screen.getByTestId('calendar-grid')).getByTitle('Write migration runbook'),
    );
    expect(useStore.getState().modal?.type).toBe('task');
  });
});

describe('Calendar — week view', () => {
  it('toggles to a Sun–Sat week containing today', async () => {
    render(<Calendar />);
    await userEvent.click(screen.getByRole('tab', { name: 'Week' }));
    expect(screen.getByRole('heading', { name: 'Jul 5 – Jul 11, 2026' })).toBeInTheDocument();
    const grid = screen.getByTestId('calendar-week-grid');
    // Chips inside the week render; the month grid is gone.
    expect(within(grid).getByTitle('Write migration runbook')).toBeInTheDocument();
    expect(within(grid).getByTitle('Sand to 220 grit')).toBeInTheDocument();
    expect(screen.queryByTestId('calendar-grid')).not.toBeInTheDocument();
    // "Meet with accountant" is due Sun Jul 12 — next week, not this grid.
    expect(within(grid).queryByTitle('Meet with accountant')).not.toBeInTheDocument();
  });

  it('pages weeks and returns via Today', async () => {
    render(<Calendar />);
    await userEvent.click(screen.getByRole('tab', { name: 'Week' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next week' }));
    expect(screen.getByRole('heading', { name: 'Jul 12 – Jul 18, 2026' })).toBeInTheDocument();
    // Next week's grid now holds the Sunday Jul-12 task.
    expect(
      within(screen.getByTestId('calendar-week-grid')).getByTitle('Meet with accountant'),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(screen.getByRole('heading', { name: 'Jul 5 – Jul 11, 2026' })).toBeInTheDocument();
    expect(useStore.getState().calWeek).toBeNull();

    // Month mode state is untouched by week paging.
    await userEvent.click(screen.getByRole('tab', { name: 'Month' }));
    expect(screen.getByRole('heading', { name: 'July 2026' })).toBeInTheDocument();
  });

  it('day numbers open the day view from the week grid', async () => {
    render(<Calendar />);
    await userEvent.click(screen.getByRole('tab', { name: 'Week' }));
    const grid = screen.getByTestId('calendar-week-grid');
    // Several days hold 2 tasks; pick today's column by its day number.
    const dayButtons = within(grid).getAllByTitle(/View all \d+ tasks due this day/);
    const todayBtn = dayButtons.find((b) => b.textContent === '8');
    expect(todayBtn).toBeDefined();
    await userEvent.click(todayBtn!);
    expect(useStore.getState().modal).toEqual({ type: 'day', iso: TEST_TODAY });
  });
});

describe('Calendar — fixed cells & day view', () => {
  function crowdedWorkspace() {
    const base = seedWorkspace(TEST_TODAY);
    const extra = Array.from({ length: 5 }, (_, i) => ({
      ...base.tasks[0]!,
      id: `crowd${String(i)}`,
      title: `Crowded task ${String(i)} with an extremely long title that must not widen its column`,
      projectId: 'p1',
      status: 'Todo' as const,
      completedAt: null,
      dueDate: '2026-07-21',
      dependsOn: [],
    }));
    return { ...base, tasks: [...base.tasks, ...extra] };
  }

  it('caps chips per cell and offers "+N more"', () => {
    loadTestWorkspace(crowdedWorkspace());
    render(<Calendar />);
    const grid = screen.getByTestId('calendar-grid');
    // 5 tasks due Jul 21 → 3 chips + "+2 more".
    expect(within(grid).getAllByTitle(/Crowded task/)).toHaveLength(3);
    expect(within(grid).getByRole('button', { name: '+2 more' })).toBeInTheDocument();
  });

  it('"+N more" and the day number open the single-day view', async () => {
    loadTestWorkspace(crowdedWorkspace());
    render(<Calendar />);
    const grid = screen.getByTestId('calendar-grid');

    await userEvent.click(within(grid).getByRole('button', { name: '+2 more' }));
    expect(useStore.getState().modal).toEqual({ type: 'day', iso: '2026-07-21' });

    useStore.getState().closeModal();
    await userEvent.click(within(grid).getByTitle('View all 5 tasks due this day'));
    expect(useStore.getState().modal).toEqual({ type: 'day', iso: '2026-07-21' });
  });

  it('day numbers are plain (not buttons) on empty days', () => {
    render(<Calendar />);
    const grid = screen.getByTestId('calendar-grid');
    // Jul 25 has nothing due in the seed → no clickable number for it.
    const buttons = within(grid).getAllByRole('button');
    expect(buttons.some((b) => b.textContent === '25')).toBe(false);
    expect(within(grid).getByText('25')).toBeInTheDocument();
    // Jul 8 (today, 2 due) IS clickable.
    expect(buttons.some((b) => b.textContent === '8')).toBe(true);
  });
});
