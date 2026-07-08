import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useStore } from '../app/store';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { loadTestWorkspace, setupTestApp, TEST_TODAY } from '../test-utils';

import { ModalHost } from './TaskModal';

beforeEach(() => {
  setupTestApp();
  loadTestWorkspace();
});

function ws() {
  const w = useStore.getState().workspace;
  if (w === null) throw new Error('no workspace');
  return w;
}

function task(id: string) {
  const t = ws().tasks.find((x) => x.id === id);
  if (t === undefined) throw new Error(`no task ${id}`);
  return t;
}

function openModal(id: string) {
  useStore.getState().openTask(id);
  return render(<ModalHost />);
}

describe('TaskModal', () => {
  it('renders every field for the task', () => {
    // t2 "Provision new k8s cluster": Doing, High, due +2d, 3 subtasks, dep on t1.
    openModal('t2');
    const dialog = screen.getByRole('dialog', { name: 'Edit task' });
    expect(within(dialog).getByPlaceholderText('Task title')).toHaveValue(
      'Provision new k8s cluster',
    );
    expect(within(dialog).getByLabelText('Project')).toHaveValue('p1');
    expect(within(dialog).getByLabelText('Status')).toHaveValue('Doing');
    expect(within(dialog).getByLabelText('Priority')).toHaveValue('High');
    expect(within(dialog).getByLabelText('Due date')).toHaveValue('2026-07-10');
    expect(within(dialog).getByText('SUBTASKS · 1/3')).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue('Terraform modules')).toBeInTheDocument();
    // Blocked-by list: sibling t1 is checked.
    const dep = within(dialog).getByText('Audit legacy service dependencies').closest('label');
    expect(within(dep as HTMLElement).getByRole('checkbox')).toBeChecked();
    expect(within(dialog).getByText('in Q3 Platform Migration')).toBeInTheDocument();
  });

  it('auto-saves field edits (title, status stamps completedAt)', async () => {
    openModal('t3');
    const dialog = screen.getByRole('dialog', { name: 'Edit task' });

    await userEvent.type(within(dialog).getByPlaceholderText('Task title'), '!');
    expect(task('t3').title).toBe('Migrate auth service!');

    await userEvent.selectOptions(within(dialog).getByLabelText('Status'), 'Done');
    expect(task('t3').status).toBe('Done');
    expect(task('t3').completedAt).toBe(TEST_TODAY);

    await userEvent.selectOptions(within(dialog).getByLabelText('Status'), 'Todo');
    expect(task('t3').completedAt).toBeNull();
  });

  it('sets and clears the due date', async () => {
    openModal('t3');
    const due = screen.getByLabelText('Due date');
    await userEvent.clear(due);
    expect(task('t3').dueDate).toBeNull();
  });

  it('toggles, adds, edits, and removes subtasks', async () => {
    openModal('t2');
    const dialog = screen.getByRole('dialog', { name: 'Edit task' });

    await userEvent.click(within(dialog).getByLabelText('Toggle subtask Network policies'));
    expect(task('t2').subtasks[1]?.done).toBe(true);

    await userEvent.type(
      within(dialog).getByPlaceholderText('+ add subtask'),
      'DNS records{Enter}',
    );
    expect(task('t2').subtasks).toHaveLength(4);
    expect(task('t2').subtasks[3]).toEqual({ title: 'DNS records', done: false });

    await userEvent.click(within(dialog).getByLabelText('Remove subtask DNS records'));
    expect(task('t2').subtasks).toHaveLength(3);
  });

  it('toggles dependencies via the Blocked-by checkboxes', async () => {
    openModal('t3'); // depends on t2
    const dialog = screen.getByRole('dialog', { name: 'Edit task' });
    const cluster = within(dialog).getByText('Provision new k8s cluster').closest('label');
    await userEvent.click(within(cluster as HTMLElement).getByRole('checkbox'));
    expect(task('t3').dependsOn).toEqual([]);

    const runbook = within(dialog).getByText('Write migration runbook').closest('label');
    await userEvent.click(within(runbook as HTMLElement).getByRole('checkbox'));
    expect(task('t3').dependsOn).toEqual(['t6']);
  });

  it('moving the task to another project clears dependencies', async () => {
    openModal('t3');
    await userEvent.selectOptions(screen.getByLabelText('Project'), 'p2');
    expect(task('t3').projectId).toBe('p2');
    expect(task('t3').dependsOn).toEqual([]);
  });

  it('cycles status from the header circle', async () => {
    openModal('t3'); // Todo
    await userEvent.click(screen.getByTitle('Advance status'));
    expect(task('t3').status).toBe('Doing');
  });

  it('closes on backdrop click and Done, keeps edits', async () => {
    openModal('t3');
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(useStore.getState().modal).toBeNull();

    act(() => {
      useStore.getState().openTask('t3'); // same mounted host re-renders
    });
    await userEvent.click(screen.getByTestId('task-modal-overlay'));
    expect(useStore.getState().modal).toBeNull();
  });

  it('deletes the task after confirm and scrubs dependencies', async () => {
    useStore.getState().openTask('t2'); // t3/t4 depend on t2
    render(
      <>
        <ModalHost />
        <ConfirmDialog />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete task' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Confirm' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(ws().tasks.some((t) => t.id === 't2')).toBe(false);
    expect(task('t3').dependsOn).toEqual([]);
    expect(useStore.getState().modal).toBeNull();
  });

  it('renders nothing for a vanished task id', () => {
    useStore.setState({ modal: { type: 'task', id: 'ghost' } });
    render(<ModalHost />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
