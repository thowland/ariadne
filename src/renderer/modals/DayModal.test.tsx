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
