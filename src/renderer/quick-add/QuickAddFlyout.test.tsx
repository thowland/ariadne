import { quickAddContext } from '@shared/domain/quick-add';
import { seedWorkspace } from '@shared/domain/seed';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setupTestApp, TEST_TODAY } from '../test-utils';

import { QuickAddFlyout } from './QuickAddFlyout';

const context = quickAddContext(seedWorkspace(TEST_TODAY));

function setup(lastProjectId: string | null = 'p3') {
  const api = setupTestApp();
  vi.mocked(api.getQuickAddContext).mockResolvedValue({ context, lastProjectId });
  return api;
}

describe('QuickAddFlyout (D51)', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  it('opens on the project last used', async () => {
    setup('p3');
    render(<QuickAddFlyout />);
    await waitFor(() => {
      expect(screen.getByLabelText('Project')).toHaveValue('p3');
    });
  });

  it('sends the composed task, with the date read out of the title', async () => {
    const api = setup('p1');
    render(<QuickAddFlyout />);
    await waitFor(() => {
      expect(screen.getByLabelText('Project')).toHaveValue('p1');
    });
    await userEvent.selectOptions(screen.getByLabelText('Project'), 'p4');
    await userEvent.type(screen.getByLabelText('Add a task'), 'File the extension tomorrow{Enter}');
    expect(api.submitQuickAdd).toHaveBeenCalledWith({
      projectId: 'p4',
      title: 'File the extension',
      dueDate: '2026-07-09',
      tags: [],
      people: [],
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Added “File the extension” to 2025 Taxes',
    );
    // Ready for the next one.
    expect(screen.getByLabelText('Add a task')).toHaveValue('');
  });

  it('shows the main process’s reason when a task cannot be handed over', async () => {
    const api = setup();
    vi.mocked(api.submitQuickAdd).mockResolvedValue({ ok: false, error: 'Window closed' });
    render(<QuickAddFlyout />);
    await userEvent.type(await screen.findByLabelText('Add a task'), 'Something{Enter}');
    expect(await screen.findByRole('status')).toHaveTextContent('Window closed');
  });

  it('closes on Escape', async () => {
    const api = setup();
    render(<QuickAddFlyout />);
    await screen.findByLabelText('Add a task');
    await userEvent.keyboard('{Escape}');
    expect(api.hideQuickAdd).toHaveBeenCalled();
  });

  it('waits for the main window, and says when there is nowhere to add', async () => {
    const api = setupTestApp();
    render(<QuickAddFlyout />);
    expect(await screen.findByText(/Waiting for Ariadne/)).toBeInTheDocument();

    vi.mocked(api.getQuickAddContext).mockResolvedValue({
      context: { ...context, projects: [] },
      lastProjectId: null,
    });
    const shown = vi.mocked(api.onQuickAddShown).mock.calls.at(-1)?.[0];
    act(() => {
      shown?.();
    });
    expect(await screen.findByText(/no active projects/)).toBeInTheDocument();
  });

  it('follows live context changes, keeping the chosen project when it survives', async () => {
    const api = setup('p3');
    render(<QuickAddFlyout />);
    await waitFor(() => {
      expect(screen.getByLabelText('Project')).toHaveValue('p3');
    });
    const push = vi.mocked(api.onQuickAddContext).mock.calls.at(-1)?.[0];
    act(() => {
      push?.({ ...context, projects: context.projects.filter((p) => p.id !== 'p3') });
    });
    // p3 was archived in the main window; fall back to the first project.
    expect(screen.getByLabelText('Project')).toHaveValue('p1');
    act(() => {
      push?.({ ...context, theme: 'dark' });
    });
    expect(screen.getByLabelText('Project')).toHaveValue('p1');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
