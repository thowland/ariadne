import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useStore } from '../app/store';
import { loadTestWorkspace, setupTestApp } from '../test-utils';

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
