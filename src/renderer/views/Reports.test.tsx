import { isoAdd } from '@shared/domain/dates';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getApi } from '../app/api';
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

  it('retro keeps archived projects, flagged as archived', async () => {
    const w = useStore.getState().workspace!;
    useStore.setState({
      workspace: {
        ...w,
        projects: w.projects.map((p) => (p.id === 'p1' ? { ...p, archived: true } : p)),
      },
    });
    render(<Reports />);
    await userEvent.click(screen.getByRole('tab', { name: 'Retrospective' }));
    // p1's completions still count, and its group is labelled.
    expect(screen.getByTestId('retro-headline')).toHaveTextContent('6');
    const head = screen.getByText('Q3 Platform Migration').closest('.report-project-head');
    expect(within(head as HTMLElement).getByText('archived')).toBeInTheDocument();
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

describe('Reports — deferred (D23)', () => {
  /** Give a seeded task a due-date history of `count` push-outs. */
  function seedDeferrals(taskId: string, count: number, dueDate: string): void {
    const w = useStore.getState().workspace!;
    let from = '2026-06-01';
    const deferrals = Array.from({ length: count }, (_, i) => {
      const to = isoAdd(from, 2);
      const record = { from, to, on: isoAdd('2026-06-02', i) };
      from = to;
      return record;
    });
    useStore.setState({
      workspace: {
        ...w,
        tasks: w.tasks.map((t) => (t.id === taskId ? { ...t, deferrals, dueDate } : t)),
      },
    });
  }

  /** The headline number sitting above a given analytics label. */
  function stat(label: string): string | undefined {
    return within(screen.getByTestId('defer-stats'))
      .getByText(label)
      .previousElementSibling?.textContent.trim();
  }

  async function openDeferred(): Promise<void> {
    render(<Reports />);
    await userEvent.click(screen.getByRole('tab', { name: 'Deferred' }));
  }

  it('says so plainly when nothing has ever been deferred', async () => {
    await openDeferred();
    expect(screen.getByTestId('defer-clear')).toBeInTheDocument();
  });

  it('ranks deferred tasks worst-first with their analytics', async () => {
    seedDeferrals('t2', 5, '2026-07-01');
    seedDeferrals('t4', 2, '2026-08-01');
    await openDeferred();

    expect(stat('ever deferred')).toBe('2');
    expect(stat('reschedules total')).toBe('7');
    expect(stat('days pushed out')).toBe('14d');
    expect(stat('at 3+ reschedules')).toBe('1');
    expect(stat('still open & overdue')).toBe('1');

    const rows = screen.getByTestId('defer-rows');
    const titles = within(rows)
      .getAllByRole('button')
      .map((r) => r.querySelector('.risk-title')?.textContent);
    expect(titles[0]).toBe('Provision new k8s cluster'); // t2, 5 pushes
    expect(within(rows).getByText('5×')).toBeInTheDocument();
  });

  it('respects the threshold picker', async () => {
    seedDeferrals('t2', 5, '2026-07-01');
    seedDeferrals('t4', 2, '2026-08-01');
    await openDeferred();
    // Default threshold is 3, so only the 5× task is listed.
    expect(within(screen.getByTestId('defer-rows')).getAllByRole('button')).toHaveLength(1);

    await userEvent.selectOptions(screen.getByLabelText('Minimum reschedules'), '2');
    expect(within(screen.getByTestId('defer-rows')).getAllByRole('button')).toHaveLength(2);

    await userEvent.selectOptions(screen.getByLabelText('Minimum reschedules'), '8');
    expect(screen.getByTestId('defer-empty')).toBeInTheDocument();
    // The headline analytics still describe every deferred task.
    expect(stat('reschedules total')).toBe('7');
  });

  it('breaks the churn down by project and priority, and opens what you click', async () => {
    seedDeferrals('t2', 4, '2026-07-01');
    await openDeferred();
    expect(
      within(screen.getByTestId('defer-by-project')).getByText('Q3 Platform Migration'),
    ).toBeInTheDocument();
    expect(within(screen.getByTestId('defer-by-priority')).getByText('High')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Provision new k8s cluster'));
    expect(useStore.getState().modal).toMatchObject({ type: 'task', id: 't2' });
  });

  it('copies a plain-text version of the deferred report', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    seedDeferrals('t2', 4, '2026-07-01');
    await openDeferred();
    await userEvent.click(screen.getByText('Copy report'));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('REPEATEDLY DEFERRED'));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('4× deferred'));
  });

  it('scopes like every other report — work never leaks home', async () => {
    seedDeferrals('t2', 4, '2026-07-01'); // p1 = work
    await openDeferred();
    await userEvent.selectOptions(screen.getByLabelText('Report scope'), 'home');
    expect(screen.getByTestId('defer-clear')).toBeInTheDocument();
  });
});

describe('Reports — portfolio sorting', () => {
  async function openPortfolio() {
    render(<Reports />);
    await userEvent.click(screen.getByRole('tab', { name: 'Portfolio roll-up' }));
    return screen.getByTestId('portfolio-table');
  }

  const names = (table: HTMLElement): string[] =>
    within(table)
      .getAllByRole('row')
      .slice(1) // drop the header row
      .map((r) => within(r).getAllByRole('cell')[0]?.textContent.trim() ?? '');

  it('defaults to project name ascending', async () => {
    const table = await openPortfolio();
    const shown = names(table);
    expect(shown).toEqual([...shown].sort((a, b) => a.localeCompare(b)));
    expect(within(table).getByRole('columnheader', { name: /PROJECT/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });

  it('sorts by a clicked column and reverses on a second click', async () => {
    const table = await openPortfolio();
    const openHeader = within(table).getByRole('button', { name: /OPEN/ });

    const openCounts = (): number[] =>
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((r) => Number(within(r).getAllByRole('cell')[3]?.textContent));

    // Numeric columns lead with the largest — that is the question a count asks.
    await userEvent.click(openHeader);
    const desc = openCounts();
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
    expect(within(table).getByRole('columnheader', { name: /OPEN/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );

    // Reversing flips the values. Rows that tie stay in name order rather
    // than mirroring, so this compares the column, not the whole row list.
    await userEvent.click(openHeader);
    const asc = openCounts();
    expect(asc).toEqual([...desc].sort((a, b) => a - b));
    expect(within(table).getByRole('columnheader', { name: /OPEN/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });

  it('moves the sort to a new column rather than compounding', async () => {
    const table = await openPortfolio();
    await userEvent.click(within(table).getByRole('button', { name: /OVERDUE/ }));
    expect(within(table).getByRole('columnheader', { name: /OVERDUE/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );

    await userEvent.click(within(table).getByRole('button', { name: /PROJECT/ }));
    expect(within(table).getByRole('columnheader', { name: /PROJECT/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    expect(within(table).getByRole('columnheader', { name: /OVERDUE/ })).toHaveAttribute(
      'aria-sort',
      'none',
    );
  });

  it('does not open a project when a header is clicked', async () => {
    const table = await openPortfolio();
    await userEvent.click(within(table).getByRole('button', { name: /PROJECT/ }));
    expect(useStore.getState().view).toBe('reports');
    expect(useStore.getState().activeProjectId).toBeNull();
  });
});

describe('Reports — exports', () => {
  it('offers a PDF export on every report, and CSV only on the portfolio', async () => {
    render(<Reports />);
    for (const tab of ['Weekly status', 'Retrospective', 'At-risk', 'Deferred']) {
      await userEvent.click(screen.getByRole('tab', { name: tab }));
      expect(screen.getByRole('button', { name: 'Export PDF' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Export CSV' })).not.toBeInTheDocument();
    }
    await userEvent.click(screen.getByRole('tab', { name: 'Portfolio roll-up' }));
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument();
  });

  it('sends a complete document and a dated filename to the PDF exporter', async () => {
    render(<Reports />);
    await userEvent.click(screen.getByRole('tab', { name: 'Portfolio roll-up' }));
    await userEvent.click(screen.getByRole('button', { name: 'Export PDF' }));

    const call = vi.mocked(getApi().exportReportPdf).mock.calls[0]?.[0];
    expect(call?.suggestedName).toBe('ariadne-portfolio-roll-up-2026-07-08.pdf');
    expect(call?.html).toContain('<!doctype html>');
    expect(call?.html).toContain('Ariadne — Portfolio roll-up');
    // The captured body is the live table, so the PDF matches the screen.
    expect(call?.html).toContain('Q3 Platform Migration');
  });

  it('exports the CSV through the download channel with a header row', async () => {
    render(<Reports />);
    await userEvent.click(screen.getByRole('tab', { name: 'Portfolio roll-up' }));
    await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    const call = vi.mocked(getApi().downloadFile).mock.calls[0]?.[0];
    expect(call?.suggestedName).toBe('ariadne-portfolio-roll-up-2026-07-08.csv');
    expect(call?.content?.startsWith('Project,Type,Progress %,Open,Done,Overdue,Next due')).toBe(
      true,
    );
    expect(call?.content).toContain('Q3 Platform Migration');
  });

  it('carries the report scope into the printed subtitle', async () => {
    render(<Reports />);
    await userEvent.selectOptions(screen.getByLabelText('Report scope'), 'work');
    await userEvent.click(screen.getByRole('button', { name: 'Export PDF' }));
    const call = vi.mocked(getApi().exportReportPdf).mock.calls[0]?.[0];
    expect(call?.html).toContain('Work only');
  });

  it('surfaces an export failure as a toast', async () => {
    vi.mocked(getApi().exportReportPdf).mockResolvedValueOnce({
      savedPath: null,
      error: 'disk full',
    });
    render(<Reports />);
    await userEvent.click(screen.getByRole('button', { name: 'Export PDF' }));
    await waitFor(() => {
      expect(useStore.getState().toast).toBe('PDF export failed — disk full');
    });
  });
});
