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

  it('done-this-week lines show a neutral date, never "overdue"', () => {
    render(<Reports />);
    // "Strip old varnish" completed 5 days ago but was due Jul 2.
    const p3 = screen.getByTestId('weekly-p3');
    const line = within(p3).getByText('Strip old varnish').closest('.report-line');
    expect(line).not.toBeNull();
    expect(within(line as HTMLElement).queryByText(/overdue/)).not.toBeInTheDocument();
    expect(within(line as HTMLElement).getByText('Jul 2')).toBeInTheDocument();
  });

  it('archived projects drop out of reports and the tag filter still works', async () => {
    const w = useStore.getState().workspace!;
    useStore.setState({
      workspace: {
        ...w,
        projects: w.projects.map((p) => (p.id === 'p1' ? { ...p, archived: true } : p)),
      },
    });
    render(<Reports />);
    expect(screen.queryByTestId('weekly-p1')).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Report scope'), 'work');
    expect(screen.queryByTestId('weekly-p1')).not.toBeInTheDocument();
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
    // Real table semantics: 7 column headers, and one cell per column in
    // every row so values line up under their headers (regression: a flex
    // display on <tr> once collapsed the cells into the name).
    expect(within(table).getAllByRole('columnheader')).toHaveLength(7);
    const row = within(table).getByText('Q3 Platform Migration').closest('tr');
    expect(within(row as HTMLElement).getAllByRole('cell')).toHaveLength(7);
    expect(row).not.toHaveClass('trow');
    expect(row).toHaveTextContent('Work');
    expect(row).toHaveTextContent('5');
    expect(row).toHaveTextContent('1d overdue');
    // Progress bar: p1 is 1 done of 6 → 17%.
    expect(row).toHaveTextContent('17%');
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

  it('retro presets fill the date range; manual edits switch to custom', async () => {
    render(<Reports />);
    await userEvent.click(screen.getByRole('tab', { name: 'Retrospective' }));

    const preset = screen.getByLabelText('Date range preset');
    expect(preset).toHaveValue('last-30');

    await userEvent.selectOptions(preset, 'month-to-date');
    expect(screen.getByLabelText('From date')).toHaveValue('2026-07-01');
    expect(screen.getByLabelText('To date')).toHaveValue('2026-07-08');

    await userEvent.selectOptions(preset, 'last-week');
    expect(screen.getByLabelText('From date')).toHaveValue('2026-06-28');
    expect(screen.getByLabelText('To date')).toHaveValue('2026-07-04');

    // Touching a date input flips the preset to Custom without moving dates.
    await userEvent.clear(screen.getByLabelText('From date'));
    await userEvent.type(screen.getByLabelText('From date'), '2026-06-01');
    expect(preset).toHaveValue('custom');
    expect(screen.getByLabelText('To date')).toHaveValue('2026-07-04');
  });

  it('retro shows a completions chart with tooltips and a labeled peak', async () => {
    render(<Reports />);
    await userEvent.click(screen.getByRole('tab', { name: 'Retrospective' }));
    const chart = screen.getByTestId('retro-chart');
    // Daily buckets over the default 30-day range; the Jul 3 completion has a tooltip.
    expect(within(chart).getByTitle(/Jul 3: 1 completed/)).toBeInTheDocument();
    expect(within(chart).getByText('COMPLETIONS OVER TIME')).toBeInTheDocument();
  });

  it('weekly blocks summarize with count pills', () => {
    render(<Reports />);
    const p3 = screen.getByTestId('weekly-p3');
    expect(within(p3).getByText('1 done')).toBeInTheDocument();
    // Overdue sanding plus its direct dependent.
    expect(within(p3).getByText('2 at risk')).toBeInTheDocument();
  });

  it('renders the at-risk report: overdue plus direct dependents only', async () => {
    render(<Reports />);
    await userEvent.click(screen.getByRole('tab', { name: 'At-risk' }));
    expect(screen.getByText('1d overdue')).toBeInTheDocument();
    expect(screen.getByText('Waiting on overdue: Migrate auth service')).toBeInTheDocument();
    // Ordinary dependencies are not risks anymore.
    expect(screen.queryByText('Blocked by dependency')).not.toBeInTheDocument();
    expect(screen.queryByText('Migrate billing service')).not.toBeInTheDocument();
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
