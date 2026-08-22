import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useStore } from '../app/store';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ContextMenu } from '../components/ContextMenu';
import { loadTestWorkspace, setupTestApp } from '../test-utils';

import { ProjectDetail } from './ProjectDetail';

beforeEach(() => {
  setupTestApp();
  loadTestWorkspace();
  useStore.setState({ view: 'project', activeProjectId: 'p3' });
});

function ws() {
  const w = useStore.getState().workspace;
  if (w === null) throw new Error('no workspace');
  return w;
}

describe('ProjectDetail', () => {
  it('renders header, sorted tasks, notes, and links', () => {
    render(<ProjectDetail />);
    expect(screen.getByLabelText('Project name')).toHaveValue('Refinish boat table');
    expect(screen.getByLabelText('Category')).toHaveValue('home');
    expect(screen.getByText('1 / 5 done')).toBeInTheDocument();
    expect(screen.getByText('#woodworking')).toBeInTheDocument();

    // Canonical order: Doing (sanding) first, Done (strip) last.
    const rows = screen.getAllByTitle(/Advance status/);
    expect(rows[0]).toHaveAttribute('title', 'Advance status (Doing)');
    expect(
      screen.getByDisplayValue('Teak table off the boat', { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('Varnish product')).toBeInTheDocument();
  });

  it('edits name, category, notes, and tags with auto-save', async () => {
    render(<ProjectDetail />);
    await userEvent.type(screen.getByLabelText('Project name'), '!');
    expect(ws().projects.find((p) => p.id === 'p3')?.name).toBe('Refinish boat table!');

    await userEvent.selectOptions(screen.getByLabelText('Category'), 'work');
    expect(ws().projects.find((p) => p.id === 'p3')?.category).toBe('work');

    const tagInput = screen.getByPlaceholderText('+ tag');
    await userEvent.type(tagInput, 'teak{Enter}');
    expect(ws().projects.find((p) => p.id === 'p3')?.tags).toEqual(['woodworking', 'teak']);

    await userEvent.click(screen.getByRole('button', { name: 'Remove tag woodworking' }));
    expect(ws().projects.find((p) => p.id === 'p3')?.tags).toEqual(['teak']);
  });

  it('keeps the task order pinned while statuses cycle', async () => {
    render(<ProjectDetail />);
    const titles = () =>
      screen
        .getAllByTitle(/Advance status/)
        .map((btn) => btn.closest('.trow')?.querySelector('.trow-title')?.textContent);
    const before = titles();
    expect(before[0]).toBe('Sand to 220 grit'); // Doing sorts first on entry

    // Doing → Waiting used to demote the row below every Todo; now it stays put.
    await userEvent.click(screen.getByTitle('Advance status (Doing)'));
    expect(ws().tasks.find((t) => t.title === 'Sand to 220 grit')?.status).toBe('Waiting');
    expect(titles()).toEqual(before);

    // …and further into Done, still pinned in place.
    await userEvent.click(screen.getByTitle('Advance status (Waiting)'));
    expect(titles()).toEqual(before);
  });

  it('quick-added tasks append at the end of the pinned order', async () => {
    render(<ProjectDetail />);
    const input = screen.getByPlaceholderText('Add a task, or @ someone, and press Enter…');
    await userEvent.type(input, 'Buff the finish{Enter}');
    const titles = screen
      .getAllByTitle(/Advance status/)
      .map((btn) => btn.closest('.trow')?.querySelector('.trow-title')?.textContent);
    expect(titles[titles.length - 1]).toBe('Buff the finish');
  });

  it('archives and restores the project via the checkbox', async () => {
    render(<ProjectDetail />);
    const box = screen.getByLabelText('Archive this project');
    expect(box).not.toBeChecked();
    await userEvent.click(box);
    expect(ws().projects.find((p) => p.id === 'p3')?.archived).toBe(true);
    await userEvent.click(box);
    expect(ws().projects.find((p) => p.id === 'p3')?.archived).toBe(false);
  });

  it('quick-adds a task with Enter', async () => {
    render(<ProjectDetail />);
    const input = screen.getByPlaceholderText('Add a task, or @ someone, and press Enter…');
    await userEvent.type(input, 'Buy more sandpaper{Enter}');
    expect(input).toHaveValue('');
    const added = ws().tasks.find((t) => t.title === 'Buy more sandpaper');
    expect(added).toMatchObject({ projectId: 'p3', status: 'Todo', priority: 'Medium' });
    // Appears in the task list (and possibly the dependency map as a lone node).
    expect(screen.getAllByText('Buy more sandpaper').length).toBeGreaterThanOrEqual(1);
  });

  it('+ Add task creates an empty task and opens the editor', async () => {
    render(<ProjectDetail />);
    await userEvent.click(screen.getByRole('button', { name: '+ Add task' }));
    const modal = useStore.getState().modal;
    expect(modal?.type).toBe('task');
    const modalId = modal !== null && modal.type === 'task' ? modal.id : null;
    expect(ws().tasks.find((t) => t.id === modalId)?.projectId).toBe('p3');
  });

  it('edits links inline', async () => {
    render(<ProjectDetail />);
    await userEvent.click(screen.getByRole('button', { name: '+ Add link' }));
    const labels = screen.getAllByPlaceholderText('Label');
    await userEvent.type(labels[labels.length - 1]!, 'Teak oil');
    const p3 = ws().projects.find((p) => p.id === 'p3');
    expect(p3?.links[1]).toMatchObject({ title: 'Teak oil' });
  });

  it('deletes the project after confirm, cascading tasks', async () => {
    render(
      <>
        <ProjectDetail />
        <ConfirmDialog />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Confirm' });
    expect(dialog).toHaveTextContent('Delete this project and all its tasks?');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(ws().projects.some((p) => p.id === 'p3')).toBe(false);
    expect(ws().tasks.some((t) => t.projectId === 'p3')).toBe(false);
    expect(useStore.getState().view).toBe('home');
  });

  it('cancelling the confirm keeps the project', async () => {
    render(
      <>
        <ProjectDetail />
        <ConfirmDialog />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(ws().projects.some((p) => p.id === 'p3')).toBe(true);
    expect(useStore.getState().view).toBe('project');
  });

  it('persists dependency-map drags and resets them on demand', async () => {
    useStore.setState({ activeProjectId: 'p1' }); // p1 is the project with a dep graph
    render(<ProjectDetail />);
    expect(screen.queryByRole('button', { name: 'Reset layout' })).not.toBeInTheDocument();

    const node = screen.getByTestId('dep-node-t3');
    const down = new MouseEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientX: 0,
      clientY: 0,
    });
    fireEvent(node, down);
    fireEvent(window, new MouseEvent('pointermove', { bubbles: true, clientX: 90, clientY: 40 }));
    fireEvent(window, new MouseEvent('pointerup', { bubbles: true, clientX: 90, clientY: 40 }));

    const placed = ws().projects.find((p) => p.id === 'p1')?.depLayout?.t3;
    expect(placed).toBeDefined();
    // Node stays where it was dropped across a re-render.
    expect(screen.getByTestId('dep-node-t3').querySelector('rect')).toHaveAttribute(
      'x',
      String(placed?.x),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Reset layout' }));
    expect(ws().projects.find((p) => p.id === 'p1')?.depLayout).toEqual({});
  });

  it('persists the dependency-map height', async () => {
    useStore.setState({ activeProjectId: 'p1' });
    render(<ProjectDetail />);
    screen.getByTestId('dependency-map-resize').focus();
    await userEvent.keyboard('{ArrowDown}');
    const h = ws().projects.find((p) => p.id === 'p1')?.depMapHeight;
    expect(h).toBeGreaterThan(160);
    expect(screen.getByTestId('dependency-map')).toHaveStyle({ height: `${String(h)}px` });
  });

  it('offers a drop zone in the files card that files uploads under this project', async () => {
    render(<ProjectDetail />);
    const zone = screen.getByTestId('upload-dropzone');
    expect(zone).toBeInTheDocument();

    fireEvent.drop(zone, {
      dataTransfer: { files: [new File(['x'], 'plan.pdf', { type: 'application/pdf' })] },
    });
    await waitFor(() => {
      expect(ws().files.at(-1)).toMatchObject({ projectId: 'p3', name: 'plan.pdf' });
    });
  });

  it('shows a not-found stub for a missing project', () => {
    useStore.setState({ activeProjectId: 'ghost' });
    render(<ProjectDetail />);
    expect(screen.getByText('Project not found.')).toBeInTheDocument();
  });
});

describe('ProjectDetail — natural-language dates in quick add (D29)', () => {
  it('sets the due date and takes the phrase out of the title (D35)', async () => {
    render(<ProjectDetail />);
    const field = screen.getByLabelText('Add a task');
    await userEvent.type(field, 'call the accountant tomorrow');
    // The phrase stays visible, highlighted, while it is being typed.
    expect(screen.getByTestId('nl-date-chip')).toHaveTextContent('Tomorrow');
    expect(field).toHaveValue('call the accountant tomorrow');

    await userEvent.keyboard('{Enter}');
    // Creating the task is the moment it is accepted: the date moves to the
    // due date and stops being able to contradict it after a reschedule.
    const created = ws().tasks[ws().tasks.length - 1];
    expect(created?.title).toBe('call the accountant');
    expect(created?.dueDate).toBe('2026-07-09');
  });

  it('a linked name is never mistaken for a date on the way in (D29 × D31 × D35)', async () => {
    render(<ProjectDetail />);
    const input = screen.getByLabelText('Add a task');
    await userEvent.type(input, 'Ask @tom');
    await userEvent.click(screen.getByRole('option', { name: /Tom Whitaker/ }));
    await userEvent.type(input, ' about the coat{Enter}');

    // "Tom" abbreviates tomorrow; behind an @ it is a person, so the strip
    // must not eat his name and no due date is set.
    const created = ws().tasks[ws().tasks.length - 1];
    expect(created?.title).toBe('Ask @Tom Whitaker about the coat');
    expect(created?.dueDate).toBeNull();
  });

  it('a title that is only a date adds nothing at all', async () => {
    render(<ProjectDetail />);
    const before = ws().tasks.length;
    await userEvent.type(screen.getByLabelText('Add a task'), 'tomorrow{Enter}');
    // Stripping it leaves an empty title, and a task with no name is not a task.
    expect(ws().tasks).toHaveLength(before);
  });

  it('creates with no due date once the highlight is dismissed', async () => {
    render(<ProjectDetail />);
    const field = screen.getByLabelText('Add a task');
    await userEvent.type(field, 'call the accountant tomorrow');
    await userEvent.click(screen.getByTestId('nl-date-chip'));
    // Clicking the chip moved focus to it; go back to the field to submit.
    await userEvent.click(field);
    await userEvent.keyboard('{Enter}');

    const created = useStore
      .getState()
      .workspace!.tasks.find((t) => t.title === 'call the accountant tomorrow');
    expect(created?.dueDate).toBeNull();
  });

  it('re-arms detection for the next task after one is added', async () => {
    render(<ProjectDetail />);
    const field = screen.getByLabelText('Add a task');
    await userEvent.type(field, 'first tomorrow');
    await userEvent.click(screen.getByTestId('nl-date-chip'));
    await userEvent.click(field);
    await userEvent.keyboard('{Enter}');

    // A dismissal applies to the task being typed, not to the field forever.
    await userEvent.type(field, 'second tomorrow');
    expect(screen.getByTestId('nl-date-chip')).toBeInTheDocument();
  });
});

describe('ProjectDetail — hide completed tasks (D30)', () => {
  // The fixture opens p3 (Refinish boat table): 5 tasks, one of them Done
  // ("Strip old varnish", t13, a dependency of "Sand to 220 grit").
  const DONE_TASK = 'Strip old varnish';

  /** Task titles currently rendered in the Tasks card. */
  function listed(): (string | null)[] {
    return Array.from(document.querySelectorAll('.focus-section-body .trow-title')).map(
      (el) => el.textContent,
    );
  }

  it('offers the toggle only when there is something completed to hide', () => {
    const { rerender } = render(<ProjectDetail />);
    expect(screen.getByLabelText('Hide completed tasks')).toBeInTheDocument();

    const w = ws();
    useStore.setState({
      workspace: {
        ...w,
        tasks: w.tasks.map((t) =>
          t.projectId === 'p3' && t.status === 'Done'
            ? { ...t, status: 'Todo' as const, completedAt: null }
            : t,
        ),
      },
    });
    rerender(<ProjectDetail />);
    expect(screen.queryByLabelText('Hide completed tasks')).not.toBeInTheDocument();
  });

  it('hides Done tasks from the list when ticked', async () => {
    render(<ProjectDetail />);
    expect(listed()).toContain(DONE_TASK);

    await userEvent.click(screen.getByLabelText('Hide completed tasks'));
    expect(listed()).not.toContain(DONE_TASK);
    // Still-open work is untouched.
    expect(listed()).toContain('Sand to 220 grit');
  });

  it('persists the choice on the project, not just in view state', async () => {
    render(<ProjectDetail />);
    await userEvent.click(screen.getByLabelText('Hide completed tasks'));

    expect(ws().projects.find((p) => p.id === 'p3')?.hideCompleted).toBe(true);
    // Saved like any other project edit.
    expect(window.ariadne.saveCollections).toHaveBeenCalled();
  });

  it('is per-project — another project is unaffected', async () => {
    render(<ProjectDetail />);
    await userEvent.click(screen.getByLabelText('Hide completed tasks'));
    expect(ws().projects.find((p) => p.id === 'p1')?.hideCompleted).toBeUndefined();
  });

  it('leaves the dependency map complete, so no arrow points at nothing', async () => {
    render(<ProjectDetail />);
    await userEvent.click(screen.getByLabelText('Hide completed tasks'));
    // t13 is Done and is a dependency of t14; its node must survive.
    expect(screen.getByTestId('dep-node-t13')).toBeInTheDocument();
  });

  it('explains itself when hiding empties the list', async () => {
    const w = ws();
    useStore.setState({
      workspace: {
        ...w,
        tasks: w.tasks.map((t) =>
          t.projectId === 'p3' ? { ...t, status: 'Done' as const, completedAt: '2026-07-08' } : t,
        ),
      },
    });
    render(<ProjectDetail />);
    await userEvent.click(screen.getByLabelText('Hide completed tasks'));
    expect(screen.getByText(/Everything here is done/)).toBeInTheDocument();
  });

  it('shows the project’s Contacts card, unioned across its tasks (D31)', () => {
    render(<ProjectDetail />);
    const card = screen.getByTestId('project-contacts');
    expect(within(card).getByText('Tom Whitaker')).toBeInTheDocument();
  });

  it('@-mentions a person into a quick-added task', async () => {
    render(<ProjectDetail />);
    const input = screen.getByLabelText('Add a task');
    await userEvent.type(input, 'Ask @tom about coat timing');
    // Walk back into the mention rather than retyping it.
    await userEvent.type(input, '{Home}');
    await userEvent.keyboard('{ArrowRight>8/}');
    await userEvent.click(screen.getByRole('option', { name: /Tom Whitaker/ }));

    // Pending until the task exists — the chip shows who it will carry.
    expect(
      within(screen.getByTestId('quick-add-people')).getByText('Tom Whitaker'),
    ).toBeInTheDocument();
    await userEvent.type(input, '{Enter}');

    const created = ws().tasks[ws().tasks.length - 1];
    expect(created?.title).toBe('Ask @Tom Whitaker about coat timing');
    expect(created?.contactIds).toEqual(['c5']);
    // The pending chips are cleared for the next task.
    expect(screen.queryByTestId('quick-add-people')).not.toBeInTheDocument();
  });

  it('drops a pending person before the task is created', async () => {
    render(<ProjectDetail />);
    const input = screen.getByLabelText('Add a task');
    await userEvent.type(input, '@tom');
    await userEvent.click(screen.getByRole('option', { name: /Tom Whitaker/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove Tom Whitaker' }));
    expect(screen.queryByTestId('quick-add-people')).not.toBeInTheDocument();
  });

  it('a new name is not written to the address book until the task is added', async () => {
    render(<ProjectDetail />);
    const before = ws().contacts.length;
    const input = screen.getByLabelText('Add a task');
    await userEvent.type(input, 'Call @Nia Okoro');
    await userEvent.click(screen.getByRole('option', { name: /Add “Nia Okoro”/ }));

    // Named, shown as pending — but nobody has been created.
    const chips = screen.getByTestId('quick-add-people');
    expect(within(chips).getByText('Nia Okoro')).toBeInTheDocument();
    expect(within(chips).getByText('new')).toBeInTheDocument();
    expect(ws().contacts).toHaveLength(before);

    await userEvent.type(input, '{Enter}');
    const created = ws().contacts.find((c) => c.firstName === 'Nia');
    expect(created?.lastName).toBe('Okoro');
    const task = ws().tasks[ws().tasks.length - 1];
    expect(task?.contactIds).toEqual([created?.id]);
  });

  it('a name typed and then thought better of leaves nothing behind', async () => {
    render(<ProjectDetail />);
    const before = ws().contacts.length;
    const input = screen.getByLabelText('Add a task');
    await userEvent.type(input, 'Call @Nia Okora');
    await userEvent.click(screen.getByRole('option', { name: /Add “Nia Okora”/ }));
    // Spotted the typo: drop the chip and fix the title before adding.
    await userEvent.click(screen.getByRole('button', { name: 'Remove Nia Okora' }));
    await userEvent.clear(input);
    await userEvent.type(input, 'Call the shop{Enter}');

    expect(ws().contacts).toHaveLength(before);
    expect(ws().contacts.some((c) => c.lastName === 'Okora')).toBe(false);
    expect(ws().tasks[ws().tasks.length - 1]?.title).toBe('Call the shop');
  });

  it('Enter on a mistyped name adds the task instead of inventing a contact', async () => {
    render(<ProjectDetail />);
    const before = ws().contacts.length;
    const input = screen.getByLabelText('Add a task');
    // "@Tomm about" matches nobody; Enter here means "add the task".
    await userEvent.type(input, 'Ask @Tomm about the coat{Enter}');

    expect(ws().contacts).toHaveLength(before);
    const task = ws().tasks[ws().tasks.length - 1];
    expect(task?.title).toBe('Ask @Tomm about the coat');
    expect(task?.contactIds).toBeUndefined();
    expect(screen.queryByTestId('quick-add-people')).not.toBeInTheDocument();
  });

  it('totals the effort still to do in the header (D36)', () => {
    useStore.setState({ activeProjectId: 'p1' });
    render(<ProjectDetail />);
    const effort = screen.getByTestId('project-effort');
    // 24 + 16 + 16 + 6 + 4 open hours; the finished audit is not "left".
    expect(effort).toHaveTextContent('8d 2h left');
  });

  it('says how much of the open work carries no estimate', () => {
    useStore.setState({ activeProjectId: 'p2' });
    render(<ProjectDetail />);
    // p2 has three unestimated open tasks alongside the wireframes.
    expect(screen.getByTestId('project-effort')).toHaveTextContent('unestimated');
  });

  it('shows nothing at all for a project nobody has estimated', () => {
    useStore.setState({ activeProjectId: 'p6' });
    render(<ProjectDetail />);
    expect(screen.queryByTestId('project-effort')).not.toBeInTheDocument();
  });

  it('drag-to-link records the dependency and parks the box below it (D37)', () => {
    useStore.setState({ activeProjectId: 'p1' });
    render(<ProjectDetail />);
    const box = (id: string) => {
      const rect = screen.getByTestId(`dep-node-${id}`).querySelector('rect');
      if (rect === null) throw new Error(`no rect for ${id}`);
      return { x: Number(rect.getAttribute('x')), y: Number(rect.getAttribute('y')) };
    };
    const from = box('t6');
    const onto = box('t1');
    const node = screen.getByTestId('dep-node-t6');
    fireEvent(
      node,
      new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 0, clientY: 0 }),
    );
    const move = { clientX: onto.x - from.x, clientY: onto.y - from.y, bubbles: true };
    fireEvent(window, new MouseEvent('pointermove', move));
    fireEvent(window, new MouseEvent('pointerup', move));

    expect(ws().tasks.find((t) => t.id === 't6')?.dependsOn).toEqual(['t1']);
    expect(useStore.getState().toast).toBe(
      '“Write migration runbook” now waits on “Audit legacy service dependencies”',
    );
    // Parked under its predecessor, not on top of the box it was dropped on.
    const placed = ws().projects.find((p) => p.id === 'p1')?.depLayout?.t6;
    expect(placed?.y).toBeGreaterThan(onto.y);
    expect(placed?.x).toBe(onto.x);
  });

  it('refuses a link that would make two tasks wait on each other', () => {
    useStore.setState({ activeProjectId: 'p1' });
    render(<ProjectDetail />);
    const box = (id: string) => {
      const rect = screen.getByTestId(`dep-node-${id}`).querySelector('rect');
      if (rect === null) throw new Error(`no rect for ${id}`);
      return { x: Number(rect.getAttribute('x')), y: Number(rect.getAttribute('y')) };
    };
    // t2 already waits on t1; dropping t1 onto t2 would close the ring.
    const from = box('t1');
    const onto = box('t2');
    const node = screen.getByTestId('dep-node-t1');
    fireEvent(
      node,
      new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 0, clientY: 0 }),
    );
    const move = { clientX: onto.x - from.x, clientY: onto.y - from.y, bubbles: true };
    fireEvent(window, new MouseEvent('pointermove', move));
    fireEvent(window, new MouseEvent('pointerup', move));

    expect(ws().tasks.find((t) => t.id === 't1')?.dependsOn).toEqual([]);
    expect(useStore.getState().toast).toBe('That would make the two tasks wait on each other');
  });

  it('removes a dependency from the line’s menu', async () => {
    useStore.setState({ activeProjectId: 'p1' });
    render(
      <>
        <ProjectDetail />
        <ContextMenu />
      </>,
    );
    fireEvent.contextMenu(screen.getByTestId('edge-t1-t2'), { clientX: 30, clientY: 30 });
    await userEvent.click(within(screen.getByRole('menu')).getByText('Remove this dependency'));
    expect(ws().tasks.find((t) => t.id === 't2')?.dependsOn).toEqual([]);
    expect(useStore.getState().toast).toBe('Dependency removed');
  });
});
