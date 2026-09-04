import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useStore } from '../app/store';
import { loadTestWorkspace, setupTestApp, TEST_TODAY } from '../test-utils';

import { ModalHost } from './TaskModal';

beforeEach(() => {
  setupTestApp();
  loadTestWorkspace();
});

describe('DayModal', () => {
  it('lists every task due that day with project lines', () => {
    act(() => {
      useStore.getState().openDay(TEST_TODAY);
    });
    render(<ModalHost />);
    const dialog = screen.getByRole('dialog', { name: 'Tasks due Wednesday, July 8, 2026' });
    expect(within(dialog).getByText('2 tasks due')).toBeInTheDocument();
    expect(within(dialog).getByText('Write migration runbook')).toBeInTheDocument();
    expect(within(dialog).getByText('New onboarding wireframes')).toBeInTheDocument();
  });

  it('respects the Work/Home scope', () => {
    useStore.setState({ scope: 'home' });
    act(() => {
      useStore.getState().openDay(TEST_TODAY);
    });
    render(<ModalHost />);
    const dialog = screen.getByRole('dialog', { name: /Tasks due/ });
    // Both tasks due today are work tasks.
    expect(
      within(dialog).getByText('Nothing due this day in the current scope.'),
    ).toBeInTheDocument();
  });

  it('opening a task returns to the day view when the editor closes', async () => {
    act(() => {
      useStore.getState().openDay(TEST_TODAY);
    });
    render(<ModalHost />);
    await userEvent.click(screen.getByText('Write migration runbook'));
    expect(screen.getByRole('dialog', { name: 'Edit task' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(useStore.getState().modal).toEqual({ type: 'day', iso: TEST_TODAY });
    expect(screen.getByRole('dialog', { name: /Tasks due/ })).toBeInTheDocument();
  });

  it('closes on backdrop click and ×', async () => {
    act(() => {
      useStore.getState().openDay(TEST_TODAY);
    });
    render(<ModalHost />);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(useStore.getState().modal).toBeNull();

    act(() => {
      useStore.getState().openDay(TEST_TODAY);
    });
    await userEvent.click(screen.getByTestId('day-modal-overlay'));
    expect(useStore.getState().modal).toBeNull();
  });
});

describe('DayModal — reschedule the whole day (D41)', () => {
  function openDay(iso = TEST_TODAY) {
    act(() => {
      useStore.getState().openDay(iso);
    });
    render(<ModalHost />);
    return screen.getByRole('dialog', { name: /Tasks due/ });
  }

  it('moves every open task due that day to the picked date', async () => {
    const dialog = openDay();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reschedule all…' }));
    const date = within(dialog).getByLabelText('New due date');
    await userEvent.clear(date);
    await userEvent.type(date, '2026-07-15');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reschedule' }));

    const due = useStore
      .getState()
      .workspace!.tasks.filter((t) => ['t6', 't9'].includes(t.id))
      .map((t) => t.dueDate);
    expect(due).toEqual(['2026-07-15', '2026-07-15']);
    expect(useStore.getState().toast).toContain('Rescheduled 2 tasks');
    expect(useStore.getState().modal).toBeNull();
  });

  it('will not reschedule onto the day the tasks are already on', async () => {
    const dialog = openDay();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reschedule all…' }));
    expect(within(dialog).getByRole('button', { name: 'Reschedule' })).toBeDisabled();
  });

  it('cancel puts the control away without touching anything', async () => {
    const before = useStore.getState().workspace!.tasks;
    const dialog = openDay();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reschedule all…' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(within(dialog).queryByTestId('day-reschedule')).not.toBeInTheDocument();
    expect(useStore.getState().workspace!.tasks).toBe(before);
  });

  it('is not offered on a day with nothing open to move', () => {
    // The only task due that day is Done: it happened when it happened, and
    // moving its due date would rewrite history rather than plan.
    const dialog = openDay('2026-06-22');
    expect(within(dialog).getByText('1 task due')).toBeInTheDocument();
    expect(
      within(dialog).queryByRole('button', { name: 'Reschedule all…' }),
    ).not.toBeInTheDocument();
  });
});
