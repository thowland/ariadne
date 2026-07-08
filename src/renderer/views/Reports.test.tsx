import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useStore } from '../app/store';
import { loadTestWorkspace, setupTestApp } from '../test-utils';

import { Reports } from './Reports';

beforeEach(() => {
  setupTestApp();
  loadTestWorkspace();
  useStore.setState({ view: 'reports' });
});

describe('Reports', () => {
  it('renders the weekly status by default with per-project columns', () => {
    render(<Reports />);
    const p1 = screen.getByTestId('weekly-p1');
    expect(within(p1).getByText('Q3 Platform Migration')).toBeInTheDocument();
    expect(within(p1).getByText('DONE THIS WEEK')).toBeInTheDocument();
    expect(within(p1).getByText('Write migration runbook')).toBeInTheDocument();
    expect(within(p1).getByText('Cutover & DNS switch')).toBeInTheDocument();
  });

  it('work-only filter never shows home projects (and vice versa)', async () => {
    render(<Reports />);
    await userEvent.selectOptions(screen.getByLabelText('Report scope'), 'work');
    expect(screen.queryByTestId('weekly-p3')).not.toBeInTheDocument();
    expect(screen.queryByTestId('weekly-p4')).not.toBeInTheDocument();
    expect(screen.getByTestId('weekly-p1')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Report scope'), 'home');
    expect(screen.queryByTestId('weekly-p1')).not.toBeInTheDocument();
    expect(screen.getByTestId('weekly-p3')).toBeInTheDocument();
  });

  it('tag filter narrows to matching projects', async () => {
    render(<Reports />);
    await userEvent.selectOptions(screen.getByLabelText('Report scope'), 'tag:woodworking');
    expect(screen.getByTestId('weekly-p3')).toBeInTheDocument();
    expect(screen.queryByTestId('weekly-p1')).not.toBeInTheDocument();
  });

  it('renders the portfolio roll-up table with counts', async () => {
    render(<Reports />);
    await userEvent.click(screen.getByRole('tab', { name: 'Portfolio roll-up' }));
    const table = screen.getByTestId('portfolio-table');
    const row = within(table).getByText('Q3 Platform Migration').closest('tr');
    expect(row).toHaveTextContent('Work');
    expect(row).toHaveTextContent('5');
    expect(row).toHaveTextContent('1d overdue');
  });

  it('renders the retrospective with a date range', async () => {
    render(<Reports />);
    await userEvent.click(screen.getByRole('tab', { name: 'Retrospective' }));
    expect(screen.getByTestId('retro-headline')).toHaveTextContent('6');
    expect(screen.getByText('Strip old varnish')).toBeInTheDocument();

    // Narrow the range to the last 6 days → only the varnish completion.
    const from = screen.getByLabelText('From date');
    await userEvent.clear(from);
    // (clearing an empty date input leaves ''; type a new one)
    await userEvent.type(from, '2026-07-02');
    expect(screen.getByTestId('retro-headline')).toHaveTextContent('1');
  });

  it('renders the at-risk report with reasons', async () => {
    render(<Reports />);
    await userEvent.click(screen.getByRole('tab', { name: 'At-risk' }));
    expect(screen.getByText('1d overdue')).toBeInTheDocument();
    expect(screen.getAllByText('Blocked by dependency').length).toBeGreaterThan(0);
  });

  it('copies the current report to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<Reports />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy report' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('WEEKLY STATUS —'));
    await vi.waitFor(() => {
      expect(useStore.getState().toast).toBe('Report copied to clipboard');
    });
  });

  it('opens tasks from report lines', async () => {
    render(<Reports />);
    await userEvent.click(screen.getByTestId('weekly-p1').querySelector('.report-line')!);
    expect(useStore.getState().modal?.type).toBe('task');
  });
});
