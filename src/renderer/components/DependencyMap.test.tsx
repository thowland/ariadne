import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useStore } from '../app/store';
import { loadTestWorkspace, setupTestApp } from '../test-utils';

import { DependencyMap } from './DependencyMap';

beforeEach(() => {
  setupTestApp();
  loadTestWorkspace();
});

function projectTasks(pid: string) {
  const w = useStore.getState().workspace;
  if (w === null) throw new Error('no workspace');
  return w.tasks.filter((t) => t.projectId === pid);
}

describe('DependencyMap', () => {
  it('renders status-labelled nodes and edges for the migration project', () => {
    render(<DependencyMap tasks={projectTasks('p1')} />);
    const map = screen.getByTestId('dependency-map');
    expect(map).toBeInTheDocument();
    // All six p1 tasks are live (none Dropped) → six nodes.
    expect(map.querySelectorAll('g.dep-node')).toHaveLength(6);
    expect(screen.getByTestId('dep-node-t5')).toHaveTextContent('Waiting');
    expect(screen.getByTestId('dep-node-t5')).toHaveTextContent('Cutover & DNS switch');
    // 5 dependency edges in the seed graph for p1 (b←a, c←b, e←b, cutover←c,e).
    expect(map.querySelectorAll('path[marker-end]')).toHaveLength(5);
  });

  it('truncates long titles', () => {
    render(<DependencyMap tasks={projectTasks('p1')} />);
    expect(screen.getByTestId('dep-node-t1')).toHaveTextContent('Audit legacy service …');
  });

  it('opens the task modal when a node is clicked', async () => {
    render(<DependencyMap tasks={projectTasks('p1')} />);
    await userEvent.click(screen.getByTestId('dep-node-t3'));
    expect(useStore.getState().modal).toEqual({ type: 'task', id: 't3' });
  });

  it('shows the empty-state hint when nothing is mapped', () => {
    render(<DependencyMap tasks={[]} />);
    expect(screen.getByText(/No dependencies mapped yet/)).toBeInTheDocument();
    expect(screen.queryByTestId('dependency-map')).not.toBeInTheDocument();
  });
});
