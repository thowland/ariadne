import { seedWorkspace } from '@shared/domain/seed';
import { markTasksPushed } from '@shared/domain/todoist';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('hides archived projects from the project picker (unless it is the current home)', () => {
    const w = ws();
    useStore.setState({
      workspace: {
        ...w,
        projects: w.projects.map((p) =>
          p.id === 'p6' || p.id === 'p1' ? { ...p, archived: true } : p,
        ),
      },
    });
    openModal('t3'); // t3 lives in the now-archived p1
    const select = screen.getByLabelText('Project');
    const names = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(names).toContain('Q3 Platform Migration'); // current home stays listed
    expect(names).not.toContain('Home network upgrade');
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

describe('TaskModal · send to Todoist', () => {
  it('pushes just this task, marks it, and flips the footer to the linked note', async () => {
    vi.mocked(window.ariadne.todoistPush).mockImplementation((_token, items) =>
      Promise.resolve({
        ok: true,
        pushed: items.map((i) => ({ taskId: i.taskId, todoistId: `td-${i.taskId}` })),
        failed: 0,
      }),
    );
    openModal('t2');
    await userEvent.click(screen.getByRole('button', { name: 'Send to Todoist' }));
    await vi.waitFor(() => {
      expect(useStore.getState().toast).toBe('Sent to Todoist');
    });
    expect(task('t2').notes).toContain('todoist:td-t2');
    expect(screen.getByTestId('todoist-linked')).toHaveTextContent('In Todoist ✓');
    expect(screen.queryByRole('button', { name: 'Send to Todoist' })).not.toBeInTheDocument();

    const items = vi.mocked(window.ariadne.todoistPush).mock.calls[0]?.[1];
    expect(items).toHaveLength(1);
    expect(items?.[0]).toMatchObject({
      taskId: 't2',
      content: 'Provision new k8s cluster',
      targetProject: 'Work',
      labels: ['Q3-Platform-Migration', 'ariadne'],
    });
  });

  it('surfaces push errors and leaves the task unmarked', async () => {
    vi.mocked(window.ariadne.todoistPush).mockResolvedValue({
      ok: false,
      error: 'Add your Todoist API token first',
    });
    openModal('t2');
    await userEvent.click(screen.getByRole('button', { name: 'Send to Todoist' }));
    await vi.waitFor(() => {
      expect(useStore.getState().toast).toBe('Add your Todoist API token first');
    });
    expect(task('t2').notes).not.toContain('todoist:');
    expect(screen.getByRole('button', { name: 'Send to Todoist' })).toBeEnabled();

    // ok-but-rejected: Todoist accepted the request yet created nothing.
    vi.mocked(window.ariadne.todoistPush).mockResolvedValue({ ok: true, pushed: [], failed: 1 });
    await userEvent.click(screen.getByRole('button', { name: 'Send to Todoist' }));
    await vi.waitFor(() => {
      expect(useStore.getState().toast).toBe('Todoist did not accept the task — try again');
    });
    expect(task('t2').notes).not.toContain('todoist:');

    // IPC-level rejection: toast, and the button comes back for a retry.
    vi.mocked(window.ariadne.todoistPush).mockRejectedValue(new Error('ipc boom'));
    await userEvent.click(screen.getByRole('button', { name: 'Send to Todoist' }));
    await vi.waitFor(() => {
      expect(useStore.getState().toast).toBe('Todoist push failed unexpectedly — try again');
    });
    expect(screen.getByRole('button', { name: 'Send to Todoist' })).toBeEnabled();
  });

  it('explains why a closed task cannot be sent, without calling Todoist', async () => {
    openModal('t1'); // Done
    await userEvent.click(screen.getByRole('button', { name: 'Send to Todoist' }));
    expect(useStore.getState().toast).toBe('Only open tasks can be sent to Todoist');
    expect(window.ariadne.todoistPush).not.toHaveBeenCalled();
  });

  it('shows the linked note instead of the button for tasks already in Todoist', () => {
    const marked = markTasksPushed(seedWorkspace(TEST_TODAY), [
      { taskId: 't2', todoistId: '999' },
    ]).workspace;
    loadTestWorkspace(marked);
    openModal('t2');
    expect(screen.getByTestId('todoist-linked')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send to Todoist' })).not.toBeInTheDocument();
  });
});

describe('TaskModal — natural-language dates in the title (D29)', () => {
  it('sets the due date from a phrase typed into the title', async () => {
    useStore.getState().openTask('t6');
    render(<ModalHost />);
    const title = screen.getByLabelText('Task title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Write runbook tomorrow');

    expect(screen.getByTestId('nl-date-chip')).toHaveTextContent('Tomorrow');
    expect(task('t6').dueDate).toBe('2026-07-09');
    expect(task('t6').title).toBe('Write runbook tomorrow');
  });

  it('does NOT touch the due date merely because the title contains a weekday', () => {
    // The dangerous case: a saved task whose title happens to read like a
    // date must not have its due date rewritten just by being opened.
    const w = ws();
    useStore.setState({
      workspace: {
        ...w,
        tasks: w.tasks.map((t) =>
          t.id === 't6' ? { ...t, title: 'Ship the friday demo', dueDate: '2026-12-25' } : t,
        ),
      },
    });
    useStore.getState().openTask('t6');
    render(<ModalHost />);

    expect(screen.getByTestId('nl-date-chip')).toBeInTheDocument(); // offered…
    expect(task('t6').dueDate).toBe('2026-12-25'); // …but not applied
  });

  it('clicking the highlight clears the date it proposed', async () => {
    useStore.getState().openTask('t6');
    render(<ModalHost />);
    const title = screen.getByLabelText('Task title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Write runbook tomorrow');
    expect(task('t6').dueDate).toBe('2026-07-09');

    await userEvent.click(screen.getByTestId('nl-date-chip'));
    expect(task('t6').dueDate).toBeNull();
    expect(screen.queryByTestId('nl-date-chip')).not.toBeInTheDocument();
    // The text itself is untouched.
    expect(task('t6').title).toBe('Write runbook tomorrow');
  });

  it('lists the task’s people and unlinks one (D31)', async () => {
    openModal('t2'); // "Provision new k8s cluster" — Dana and Marcus
    const field = screen.getByTestId('task-contacts');
    expect(within(field).getByText('Dana Reyes')).toBeInTheDocument();
    await userEvent.click(within(field).getByRole('button', { name: 'Remove Marcus Bell' }));
    expect(ws().tasks.find((t) => t.id === 't2')?.contactIds).toEqual(['c1']);
  });

  it('adds a person through the People picker', async () => {
    openModal('t2');
    await userEvent.type(screen.getByLabelText('Add a contact to this task'), 'sofia');
    await userEvent.click(screen.getByRole('option', { name: /Sofia Grant/ }));
    expect(ws().tasks.find((t) => t.id === 't2')?.contactIds).toEqual(['c1', 'c2', 'c6']);
  });

  it('links someone by @-mentioning them, completing the name in the title', async () => {
    openModal('t4'); // "Migrate billing service" — nobody on it yet
    const title = screen.getByLabelText('Task title');
    await userEvent.type(title, ' with @sofia');
    await userEvent.click(screen.getByRole('option', { name: /Sofia Grant/ }));

    const task = ws().tasks.find((t) => t.id === 't4');
    expect(task?.contactIds).toEqual(['c6']);
    expect(task?.title).toBe('Migrate billing service with @Sofia Grant');
  });

  it('a contact chip navigates to that person and closes the editor', async () => {
    openModal('t2');
    await userEvent.click(screen.getByTitle('Open Dana Reyes'));
    expect(useStore.getState().modal).toBeNull();
    expect(useStore.getState().view).toBe('contact');
    expect(useStore.getState().activeContactId).toBe('c1');
  });

  it('records an effort estimate in days and hours (D36)', async () => {
    openModal('t4'); // "Migrate billing service", seeded at 16h
    const field = screen.getByLabelText('Estimate');
    expect(field).toHaveValue('2d');

    await userEvent.clear(field);
    await userEvent.type(field, '1d 4h');
    await userEvent.tab();
    expect(task('t4').estimateHours).toBe(12);
    // Committed and reformatted the way it will be shown from now on.
    expect(screen.getByLabelText('Estimate')).toHaveValue('1d 4h');
  });

  it('clearing the field means no estimate, not zero effort', async () => {
    openModal('t4');
    await userEvent.clear(screen.getByLabelText('Estimate'));
    await userEvent.tab();
    expect(task('t4').estimateHours).toBeUndefined();
  });

  it('puts back what is recorded when the text cannot be read', async () => {
    openModal('t4');
    const field = screen.getByLabelText('Estimate');
    await userEvent.clear(field);
    await userEvent.type(field, 'a while');
    await userEvent.tab();
    // The estimate survives the typo, and the user is told why.
    expect(task('t4').estimateHours).toBe(16);
    expect(screen.getByLabelText('Estimate')).toHaveValue('2d');
    expect(useStore.getState().toast).toContain('2d 4h');
  });
});

describe('TaskModal — #tags in the title (D40)', () => {
  it('tags the task from the picker and completes the word in place', async () => {
    act(() => {
      useStore.getState().openTask('t1');
    });
    render(<ModalHost />);
    const title = screen.getByLabelText('Task title');
    await userEvent.type(title, ' #wood');
    await userEvent.click(screen.getByRole('option', { name: '#woodworking' }));

    const task = useStore.getState().workspace!.tasks.find((t) => t.id === 't1');
    expect(task?.tags).toContain('woodworking');
    expect(task?.title).toContain('#woodworking');
  });
});
