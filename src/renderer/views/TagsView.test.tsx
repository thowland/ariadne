import { updateTask } from '@shared/domain/mutate';
import { emptyWorkspace } from '@shared/types';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useStore } from '../app/store';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { loadTestWorkspace, setupTestApp } from '../test-utils';

import { TagsView } from './TagsView';

beforeEach(() => {
  setupTestApp();
  loadTestWorkspace();
  useStore.setState({ view: 'tags' });
});

function ws() {
  const w = useStore.getState().workspace;
  if (w === null) throw new Error('no workspace');
  return w;
}

function renderTags() {
  return render(
    <>
      <TagsView />
      <ConfirmDialog />
    </>,
  );
}

describe('TagsView', () => {
  it('lists every tag in the workspace with a usage count', () => {
    renderTags();
    const cloud = screen.getByTestId('tags-cloud');
    // A few known seed tags across projects and tasks.
    expect(within(cloud).getByText('#woodworking')).toBeInTheDocument();
    expect(within(cloud).getByText('#infra')).toBeInTheDocument();
    expect(within(cloud).getByText('#finance')).toBeInTheDocument();
    // #woodworking is on project p3 only → count 1.
    const chip = within(cloud).getByText('#woodworking').closest('button');
    expect(within(chip as HTMLElement).getByText('1')).toBeInTheDocument();
  });

  it('clicking a tag searches for it, like tag chips elsewhere', async () => {
    renderTags();
    const cloud = screen.getByTestId('tags-cloud');
    await userEvent.click(within(cloud).getByText('#woodworking'));
    expect(useStore.getState().q).toBe('woodworking');
  });

  it('opens what a tag is on under its row, and every line goes there (D48)', async () => {
    renderTags();
    const list = screen.getByTestId('tag-manage-list');
    const chip = within(list).getByRole('button', { name: /#woodworking/ });
    expect(chip).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(chip);
    expect(chip).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByTestId('tag-items-woodworking');
    expect(within(panel).getByText('PROJECTS')).toBeInTheDocument();
    // Opening it is not a search.
    expect(useStore.getState().q).toBe('');
    const project = ws().projects.find((p) => p.tags.includes('woodworking'));
    await userEvent.click(within(panel).getByText(project!.name));
    expect(useStore.getState().activeProjectId).toBe(project!.id);

    // A second click closes it again.
    await userEvent.click(chip);
    expect(screen.queryByTestId('tag-items-woodworking')).not.toBeInTheDocument();
  });

  it('lists tagged tasks and contacts, each opening its own page', async () => {
    renderTags();
    const list = screen.getByTestId('tag-manage-list');
    await userEvent.click(within(list).getByRole('button', { name: /#vendor/ }));
    const panel = screen.getByTestId('tag-items-vendor');
    await userEvent.click(within(panel).getByText('Dana Reyes'));
    expect(useStore.getState().view).toBe('contact');
    expect(useStore.getState().activeContactId).toBe('c1');

    // Tagged after rendering, so the list re-renders with the new tag.
    const task = ws().tasks[0]!;
    act(() => {
      useStore.getState().apply((w, ctx) => updateTask(w, task.id, { tags: ['kayak'] }, ctx));
    });
    await userEvent.click(within(list).getByRole('button', { name: /#kayak/ }));
    await userEvent.click(within(screen.getByTestId('tag-items-kayak')).getByText(task.title));
    expect(useStore.getState().modal).toMatchObject({ type: 'task' });
  });

  it('shows an empty state without tags', () => {
    loadTestWorkspace(emptyWorkspace());
    renderTags();
    expect(screen.getByTestId('tags-headline')).toHaveTextContent('No tags yet');
    expect(screen.queryByTestId('tag-manage-list')).not.toBeInTheDocument();
  });
});

describe('TagsView — management (moved from Settings in v1.11)', () => {
  it('lists every tag with usage counts and management actions', () => {
    renderTags();
    const list = screen.getByTestId('tag-manage-list');
    const infraRow = within(list).getByText('#infra').closest('.tag-manage-row');
    expect(infraRow).toHaveTextContent('1 project');
    // Seed has 8 distinct project/task tags plus #vendor and #team, which
    // only the contacts carry (D31).
    expect(within(list).getAllByRole('button', { name: 'Rename…' })).toHaveLength(10);
    const vendorRow = within(list).getByText('#vendor').closest('.tag-manage-row');
    expect(vendorRow).toHaveTextContent('3 contacts');
  });

  it('renames a tag inline', async () => {
    renderTags();
    const list = screen.getByTestId('tag-manage-list');
    const row = within(list).getByText('#woodworking').closest<HTMLElement>('.tag-manage-row');
    await userEvent.click(within(row!).getByRole('button', { name: 'Rename…' }));
    const input = screen.getByLabelText('New name for woodworking');
    await userEvent.clear(input);
    await userEvent.type(input, 'boatwork{Enter}');
    expect(ws().projects.find((p) => p.id === 'p3')?.tags).toEqual(['boatwork']);
    expect(useStore.getState().toast).toBe('Renamed #woodworking to #boatwork');
  });

  it('renaming onto an existing tag asks to merge, then merges', async () => {
    renderTags();
    const list = screen.getByTestId('tag-manage-list');
    const row = within(list).getByText('#infra').closest<HTMLElement>('.tag-manage-row');
    await userEvent.click(within(row!).getByRole('button', { name: 'Rename…' }));
    const input = screen.getByLabelText('New name for infra');
    await userEvent.clear(input);
    await userEvent.type(input, 'q3{Enter}');

    const dialog = screen.getByRole('alertdialog', { name: 'Confirm' });
    expect(dialog).toHaveTextContent('Merge #infra into existing tag #q3?');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await vi.waitFor(() => {
      expect(ws().projects.find((p) => p.id === 'p1')?.tags).toEqual(['q3']);
    });
    expect(useStore.getState().toast).toBe('Merged #infra into #q3');
  });

  it('filters the manage list without touching the cloud', async () => {
    renderTags();
    const box = screen.getByLabelText('Filter tags');
    await userEvent.type(box, 'wood');

    const list = screen.getByTestId('tag-manage-list');
    expect(within(list).getByText('#woodworking')).toBeInTheDocument();
    expect(within(list).queryByText('#infra')).not.toBeInTheDocument();
    expect(within(list).getAllByRole('button', { name: 'Rename…' })).toHaveLength(1);
    // The search cloud stays complete.
    expect(within(screen.getByTestId('tags-cloud')).getByText('#infra')).toBeInTheDocument();

    // A leading # (habit from tag chips) is tolerated; clearing restores all.
    await userEvent.clear(box);
    await userEvent.type(box, '#fin');
    expect(within(list).getByText('#finance')).toBeInTheDocument();
    await userEvent.clear(box);
    expect(within(list).getAllByRole('button', { name: 'Rename…' })).toHaveLength(10);
  });

  it('shows an empty note when the filter matches nothing', async () => {
    renderTags();
    await userEvent.type(screen.getByLabelText('Filter tags'), 'zzz');
    expect(screen.getByText('No tags match “zzz”.')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('tag-manage-list')).queryAllByRole('button', { name: 'Rename…' }),
    ).toHaveLength(0);
  });

  it('deletes a tag everywhere after confirm', async () => {
    renderTags();
    const list = screen.getByTestId('tag-manage-list');
    const row = within(list).getByText('#finance').closest<HTMLElement>('.tag-manage-row');
    await userEvent.click(within(row!).getByRole('button', { name: 'Delete tag finance' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Confirm' });
    // Project p4 and contact c4 both carry it — the count spans collections.
    expect(dialog).toHaveTextContent('Remove #finance from 2 items?');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await vi.waitFor(() => {
      expect(ws().projects.find((p) => p.id === 'p4')?.tags).toEqual([]);
    });
    expect(ws().contacts.find((c) => c.id === 'c4')?.tags).toEqual([]);
  });
});
