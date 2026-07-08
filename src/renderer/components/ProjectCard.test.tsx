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
});
