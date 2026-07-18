import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useStore } from '../app/store';
import { loadTestWorkspace, setupTestApp } from '../test-utils';

import { ProjectCard } from './ProjectCard';

beforeEach(() => {
  setupTestApp();
  loadTestWorkspace();
});

function project(id: string) {
  const p = useStore.getState().workspace?.projects.find((x) => x.id === id);
  if (p === undefined) throw new Error(`no project ${id}`);
  return p;
}

describe('ProjectCard', () => {
  it('summarizes open/done/overdue and next due', () => {
    render(<ProjectCard project={project('p1')} />);
    // p1: 6 tasks, 1 done, 5 open, 1 overdue; next due = today (runbook).
    expect(screen.getByText('5 open')).toBeInTheDocument();
    expect(screen.getByText('1/6 done')).toBeInTheDocument();
    expect(screen.getByText('1 overdue')).toBeInTheDocument();
    expect(screen.getByText('Next 1d overdue')).toBeInTheDocument();
    expect(screen.getByText('Work')).toBeInTheDocument();
  });

  it('omits the overdue chip when clean', () => {
    render(<ProjectCard project={project('p6')} />);
    expect(screen.queryByText(/overdue/)).not.toBeInTheDocument();
    expect(screen.getByText('Home')).toBeInTheDocument();
  });

  it('navigates to the project on click', async () => {
    render(<ProjectCard project={project('p3')} />);
    await userEvent.click(screen.getByTestId('project-card-p3'));
    expect(useStore.getState().view).toBe('project');
    expect(useStore.getState().activeProjectId).toBe('p3');
  });

  it('status strip shows composition segments with a summary tooltip', () => {
    render(<ProjectCard project={project('p1')} />);
    const strip = screen.getByTestId('strip-p1');
    // p1: 1 done, cluster + runbook Doing, 3 blocked (auth, billing, cutover).
    expect(strip).toHaveAttribute('title', '1 done · 2 doing · 3 blocked · 0 waiting · 0 todo');
    const segs = [...strip.querySelectorAll('.status-strip-seg')].map((s) =>
      s.getAttribute('data-seg'),
    );
    expect(segs).toEqual(['done', 'doing', 'blocked']); // zero-count states omitted
  });

  it('sparkline covers 8 weeks with per-week tooltips', () => {
    render(<ProjectCard project={project('p3')} />);
    const spark = screen.getByTestId('spark-p3');
    const slots = spark.querySelectorAll('.pc-spark-slot');
    expect(slots).toHaveLength(8);
    // "Strip old varnish" completed Jul 3 → last week's bar counts 1.
    expect(spark.querySelector('[title="Week of Jun 28: 1 completed"]')).not.toBeNull();
    // The current-week bar is highlighted.
    expect(slots[7]?.querySelector('.pc-spark-bar')).toHaveClass('current');
  });

  it('due strip pools overdue and marks today in the current week', () => {
    render(<ProjectCard project={project('p4')} />);
    const strip = screen.getByTestId('due-strip-p4');
    // p4: "Gather 1099s" 3d overdue → pooled; "Categorize expenses" due Thu Jul 9.
    expect(strip).toHaveTextContent('1');
    expect(strip.querySelector('[title="1 overdue"]')).not.toBeNull();
    expect(strip.querySelectorAll('.pc-due-cell')).toHaveLength(7);
    expect(strip.querySelector('[title="Jul 9: 1 due"]')).not.toBeNull();
    expect(strip.querySelector('.pc-due-cell.today')).not.toBeNull();
  });
});
