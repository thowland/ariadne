import { seedWorkspace } from '@shared/domain/seed';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useStore } from '../app/store';
import { loadTestWorkspace, setupTestApp, TEST_TODAY } from '../test-utils';

import { TaskRow } from './TaskRow';

beforeEach(() => {
  setupTestApp();
  loadTestWorkspace();
});

function task(id: string): NonNullable<ReturnType<typeof find>> {
  const t = find(id);
  if (t === undefined) throw new Error(`no task ${id}`);
  return t;
}
function find(id: string) {
  return useStore.getState().workspace?.tasks.find((t) => t.id === id);
}

describe('TaskRow', () => {
  it('shows title, project line, and relative due label', () => {
    // t3 = "Migrate auth service", overdue by 1 day, blocked by t2.
    render(<TaskRow task={task('t3')} showProject />);
    expect(screen.getByText('Migrate auth service')).toBeInTheDocument();
    expect(screen.getByText('Q3 Platform Migration')).toBeInTheDocument();
    expect(screen.getByText('1d overdue')).toBeInTheDocument();
    expect(screen.getByText('blocked')).toBeInTheDocument();
  });

  it('suppresses the priority dot while blocked, shows it otherwise', () => {
    render(<TaskRow task={task('t3')} />);
    expect(screen.queryByTitle('Critical priority')).not.toBeInTheDocument();

    // t12 (2025 Taxes → "Gather 1099s") is High and not blocked.
    const gather = useStore
      .getState()
      .workspace!.tasks.find((t) => t.title === 'Gather 1099s and receipts')!;
    render(<TaskRow task={gather} />);
    expect(screen.getByTitle('High priority')).toBeInTheDocument();
  });

  it('strikes through Done tasks', () => {
    const done = useStore.getState().workspace!.tasks.find((t) => t.status === 'Done')!;
    render(<TaskRow task={done} />);
    expect(screen.getByText(done.title)).toHaveClass('done');
  });

  it('cycles status via the circle without opening the task', async () => {
    render(<TaskRow task={task('t3')} />);
    await userEvent.click(screen.getByTitle('Advance status (Todo)'));
    expect(find('t3')?.status).toBe('Doing');
    // Row click did not fire → still on home view.
    expect(useStore.getState().view).toBe('home');
  });

  it('opens the task editor modal on row click', async () => {
    render(<TaskRow task={task('t3')} />);
    await userEvent.click(screen.getByText('Migrate auth service'));
    expect(useStore.getState().modal).toEqual({ type: 'task', id: 't3' });
  });

  it('renders "Untitled task" for empty titles', () => {
    const ws = seedWorkspace(TEST_TODAY);
    const t = { ...ws.tasks[0]!, id: 'blank', title: '' };
    loadTestWorkspace({ ...ws, tasks: [...ws.tasks, t] });
    render(<TaskRow task={t} />);
    expect(screen.getByText('Untitled task')).toBeInTheDocument();
  });
});
