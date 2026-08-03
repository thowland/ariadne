import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useStore } from '../app/store';
import { loadTestWorkspace, setupTestApp } from '../test-utils';

import { MoveTasksModal } from './MoveTasksModal';

beforeEach(() => {
  setupTestApp();
  loadTestWorkspace();
});

function ws() {
  const w = useStore.getState().workspace;
  if (w === null) throw new Error('no workspace');
  return w;
}

function open(taskIds: string[], fromProjectId: string | null, what = 'tasks') {
  return render(<MoveTasksModal state={{ type: 'moveTasks', taskIds, fromProjectId, what }} />);
}

describe('MoveTasksModal', () => {
  it('lists every other active project as a target, never the source', () => {
    open(['t3'], 'p1');
    const names = screen.getAllByRole('button', { name: /Q3|Customer|Refinish|Taxes|Hiring|Home/ });
    expect(names.some((b) => b.textContent.includes('Q3 Platform Migration'))).toBe(false);
    expect(names.some((b) => b.textContent.includes('Customer Onboarding Revamp'))).toBe(true);
  });

  it('leaves archived projects out — moving live work into one would hide it', () => {
    const w = ws();
    useStore.setState({
      workspace: {
        ...w,
        projects: w.projects.map((p) => (p.id === 'p2' ? { ...p, archived: true } : p)),
      },
    });
    open(['t3'], 'p1');
    expect(screen.queryByText('Customer Onboarding Revamp')).not.toBeInTheDocument();
  });

  it('needs a destination before it will move anything', async () => {
    open(['t3'], 'p1');
    const go = screen.getByRole('button', { name: 'Move 1 task' });
    expect(go).toBeDisabled();
    await userEvent.click(screen.getByText('Refinish boat table'));
    expect(go).toBeEnabled();
  });

  it('moves the tasks, closes, and says where they went', async () => {
    open(['t3', 't4'], 'p1');
    await userEvent.click(screen.getByText('Refinish boat table'));
    await userEvent.click(screen.getByRole('button', { name: 'Move 2 tasks' }));

    expect(ws().tasks.find((t) => t.id === 't3')?.projectId).toBe('p3');
    expect(ws().tasks.find((t) => t.id === 't4')?.projectId).toBe('p3');
    expect(useStore.getState().modal).toBeNull();
    expect(useStore.getState().toast).toBe('Moved 2 tasks to Refinish boat table');
  });

  it('moving a whole project keeps its dependency chains intact', async () => {
    const p1Tasks = ws().tasks.filter((t) => t.projectId === 'p1');
    const linked = p1Tasks.find((t) => t.dependsOn.length > 0);
    expect(linked).toBeDefined();
    open(
      p1Tasks.map((t) => t.id),
      'p1',
    );
    await userEvent.click(screen.getByText('Refinish boat table'));
    await userEvent.click(screen.getByRole('button', { name: `Move ${p1Tasks.length} tasks` }));

    const after = ws().tasks.find((t) => t.id === linked?.id);
    expect(after?.projectId).toBe('p3');
    expect(after?.dependsOn).toEqual(linked?.dependsOn);
  });

  it('moving one task out of a chain scrubs the dependency', async () => {
    const linked = ws().tasks.find((t) => t.projectId === 'p1' && t.dependsOn.length > 0);
    open([linked!.id], 'p1');
    await userEvent.click(screen.getByText('Refinish boat table'));
    await userEvent.click(screen.getByRole('button', { name: 'Move 1 task' }));
    expect(ws().tasks.find((t) => t.id === linked?.id)?.dependsOn).toEqual([]);
  });

  it('says so when there is nowhere to move to', () => {
    const w = ws();
    useStore.setState({ workspace: { ...w, projects: w.projects.filter((p) => p.id === 'p1') } });
    open(['t3'], 'p1');
    expect(screen.getByText(/No other active project/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move 1 task' })).toBeDisabled();
  });

  it('closes without moving on Cancel', async () => {
    open(['t3'], 'p1');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(ws().tasks.find((t) => t.id === 't3')?.projectId).toBe('p1');
    expect(useStore.getState().modal).toBeNull();
  });

  it('a double-click on a destination is a shortcut for picking and moving', async () => {
    open(['t3'], 'p1');
    await userEvent.dblClick(screen.getByText('Refinish boat table'));
    expect(ws().tasks.find((t) => t.id === 't3')?.projectId).toBe('p3');
  });

  it('shows what is being moved in the header', () => {
    open(['t3'], 'p1', '6 tasks in Q3 Platform Migration');
    const dialog = screen.getByRole('dialog', { name: 'Move tasks to project' });
    expect(within(dialog).getByText('6 tasks in Q3 Platform Migration')).toBeInTheDocument();
  });
});
