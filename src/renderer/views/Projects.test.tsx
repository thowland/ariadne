import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useStore } from '../app/store';
import { loadTestWorkspace, setupTestApp } from '../test-utils';

import { Projects } from './Projects';

beforeEach(() => {
  setupTestApp();
  loadTestWorkspace();
});

/** Visible project names, in table order. */
function names(): string[] {
  return (
    within(screen.getByTestId('projects-table'))
      .getAllByRole('row')
      .slice(1) // drop the header row
      // The name cell also carries the "Archived" tag; strip it to compare names.
      .map((r) =>
        (r.querySelector('.portfolio-name')?.textContent ?? '').replace('Archived', '').trim(),
      )
      .filter((n) => n !== '')
  );
}

describe('Projects inventory', () => {
  it('lists every active project with its counts and tags', () => {
    render(<Projects />);
    expect(screen.getByTestId('projects-headline')).toHaveTextContent('6 projects');
    expect(names()).toHaveLength(6);

    const row = screen.getByTestId('projects-row-p1');
    expect(within(row).getByText('Q3 Platform Migration')).toBeInTheDocument();
    expect(within(row).getByText('Work')).toBeInTheDocument();
    // Tags the sidebar has no room for.
    expect(within(row).getByText('#infra')).toBeInTheDocument();
    expect(within(row).getByText('#q3')).toBeInTheDocument();
  });

  it('opens a project when its row is clicked', async () => {
    render(<Projects />);
    await userEvent.click(screen.getByTestId('projects-row-p3'));
    expect(useStore.getState().view).toBe('project');
    expect(useStore.getState().activeProjectId).toBe('p3');
  });

  /** The Open column, top to bottom. */
  function openCounts(): number[] {
    return within(screen.getByTestId('projects-table'))
      .getAllByRole('row')
      .slice(1)
      .map((r) => Number(r.querySelectorAll('td')[3]?.textContent));
  }

  it('sorts by a column, and reverses on a second click', async () => {
    render(<Projects />);
    // Default is project name, A–Z.
    expect(names()[0]).toBe('2025 Taxes');

    // A count column starts with the largest…
    await userEvent.click(screen.getByRole('button', { name: 'OPEN' }));
    const desc = openCounts();
    expect(desc).toEqual([...desc].sort((a, b) => b - a));

    // …and the second click flips it. Ties keep their A–Z order in both
    // directions (sortPortfolio's total-order tie-break), so this asserts the
    // counts are monotonic rather than that the rows are exactly reversed.
    await userEvent.click(screen.getByRole('button', { name: 'OPEN' }));
    const asc = openCounts();
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    expect(asc[0]).toBe(desc[desc.length - 1]);
  });

  it('keeps archived projects out until they are asked for (D13)', async () => {
    const w = useStore.getState().workspace!;
    useStore.setState({
      workspace: {
        ...w,
        projects: w.projects.map((p) => (p.id === 'p6' ? { ...p, archived: true } : p)),
      },
    });
    render(<Projects />);
    expect(names()).not.toContain('Home network upgrade');
    expect(names()).toHaveLength(5);

    await userEvent.click(screen.getByLabelText(/Show archived/));
    expect(names()).toContain('Home network upgrade');
    expect(screen.getByTestId('projects-row-p6').className).toContain('archived');
  });

  it('offers no archived toggle when nothing is archived', () => {
    render(<Projects />);
    expect(screen.queryByLabelText(/Show archived/)).not.toBeInTheDocument();
  });

  it('agrees with the portfolio report about the numbers', () => {
    render(<Projects />);
    // p1 has 6 seeded tasks: 1 done, 5 open, 1 of them overdue.
    const cells = within(screen.getByTestId('projects-row-p1')).getAllByRole('cell');
    expect(cells[3]).toHaveTextContent('5'); // open
    expect(cells[4]).toHaveTextContent('1'); // done
    expect(cells[5]).toHaveTextContent('1'); // overdue
  });

  it('says so plainly when there are no projects at all', () => {
    const w = useStore.getState().workspace!;
    useStore.setState({ workspace: { ...w, projects: [], tasks: [], files: [] } });
    render(<Projects />);
    expect(screen.getByTestId('projects-empty')).toBeInTheDocument();
  });
});
