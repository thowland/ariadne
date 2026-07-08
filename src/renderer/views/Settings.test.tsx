import { seedWorkspace } from '@shared/domain/seed';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useStore } from '../app/store';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { loadTestWorkspace, setupTestApp, TEST_TODAY } from '../test-utils';

import { Settings } from './Settings';

beforeEach(() => {
  setupTestApp();
  loadTestWorkspace();
  useStore.setState({ view: 'settings' });
});

function ws() {
  const w = useStore.getState().workspace;
  if (w === null) throw new Error('no workspace');
  return w;
}

function renderSettings() {
  return render(
    <>
      <Settings />
      <ConfirmDialog />
    </>,
  );
}

describe('Settings', () => {
  it('shows the data directory and reference legends', async () => {
    renderSettings();
    expect(await screen.findByTestId('data-dir')).toHaveTextContent('/tmp/data');
    expect(screen.getByText('Todo')).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
  });

  it('exports via the main process and toasts the result', async () => {
    vi.mocked(window.ariadne.exportWorkspace).mockResolvedValue({ savedPath: '/tmp/x.json' });
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Export JSON' }));
    await vi.waitFor(() => {
      expect(useStore.getState().toast).toBe('Exported JSON backup');
    });
  });

  it('applies a successful file import and navigates home', async () => {
    const imported = seedWorkspace(TEST_TODAY);
    imported.projects = imported.projects.slice(0, 2);
    imported.tasks = imported.tasks.filter((t) => t.projectId === 'p1' || t.projectId === 'p2');
    imported.files = [];
    vi.mocked(window.ariadne.importFromFile).mockResolvedValue({
      ok: true,
      workspace: imported,
      warnings: [],
    });
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Import file…' }));
    await vi.waitFor(() => {
      expect(ws().projects).toHaveLength(2);
    });
    expect(useStore.getState().view).toBe('home');
    expect(useStore.getState().toast).toMatch(/Imported 2 projects/);
  });

  it('stays quiet on a cancelled import, toasts real failures', async () => {
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Import file…' }));
    await vi.waitFor(() => {
      expect(vi.mocked(window.ariadne.importFromFile)).toHaveBeenCalled();
    });
    expect(useStore.getState().toast).toBeNull(); // default mock = cancelled

    vi.mocked(window.ariadne.importFromText).mockResolvedValue({
      ok: false,
      error: 'Invalid JSON — import failed',
    });
    await userEvent.type(screen.getByPlaceholderText('Paste exported JSON here…'), '{{nope');
    await userEvent.click(screen.getByRole('button', { name: 'Apply pasted JSON' }));
    await vi.waitFor(() => {
      expect(useStore.getState().toast).toBe('Invalid JSON — import failed');
    });
  });

  it('refuses to import empty pasted text', async () => {
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Apply pasted JSON' }));
    expect(useStore.getState().toast).toBe('Nothing to import');
    expect(window.ariadne.importFromText).not.toHaveBeenCalled();
  });

  it('reset to sample data requires confirm and reseeds', async () => {
    useStore.setState({
      workspace: { ...ws(), tasks: [] },
    });
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Reset to sample data' }));
    await userEvent.click(screen.getByRole('alertdialog').querySelector('.btn.danger')!);
    await vi.waitFor(() => {
      expect(ws().tasks).toHaveLength(30);
    });
  });

  it('clear all empties the workspace and deletes blob bytes', async () => {
    const w0 = ws();
    loadTestWorkspace({
      ...w0,
      files: [...w0.files, { ...w0.files[0]!, id: 'bin9', kind: 'file', ext: 'pdf' }],
    });
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    await userEvent.click(screen.getByRole('alertdialog').querySelector('.btn.danger')!);
    await vi.waitFor(() => {
      expect(ws().projects).toHaveLength(0);
    });
    expect(ws().files).toHaveLength(0);
    expect(window.ariadne.deleteBlobs).toHaveBeenCalledWith(['bin9']);
  });

  it('changing the data dir shows the migration toast', async () => {
    vi.mocked(window.ariadne.chooseDataDir).mockResolvedValue({
      mode: 'migrated',
      path: '/somewhere/synced',
      relaunching: true,
    });
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Change…' }));
    await vi.waitFor(() => {
      expect(useStore.getState().toast).toMatch(/Data migrated/);
    });
    expect(screen.getByTestId('data-dir')).toHaveTextContent('/somewhere/synced');
  });
});

describe('Settings — Todoist import', () => {
  it('saves the token and imports into the inbox with a toast', async () => {
    vi.mocked(window.ariadne.todoistFetch).mockResolvedValue({
      ok: true,
      items: [
        {
          todoistId: '9001',
          title: 'Call plumber',
          dueDate: '2026-07-09',
          priority: 'High',
          notes: '',
        },
      ],
    });
    renderSettings();

    await userEvent.type(screen.getByLabelText('Todoist API token'), 'tok123');
    expect(ws().settings.todoistToken).toBe('tok123');

    await userEvent.click(screen.getByRole('button', { name: 'Import now' }));
    await vi.waitFor(() => {
      expect(useStore.getState().toast).toBe('Imported 1 task from Todoist');
    });
    expect(vi.mocked(window.ariadne.todoistFetch)).toHaveBeenCalledWith('tok123');
    expect(ws().projects.some((p) => p.id === 'todoist-inbox')).toBe(true);
    expect(ws().tasks.some((t) => t.title === 'Call plumber')).toBe(true);
    expect(ws().settings.lastTodoistImportAt).not.toBeNull();
    expect(screen.getByTestId('todoist-last-import')).toBeInTheDocument();
  });

  it('surfaces fetch errors and leaves the workspace untouched', async () => {
    vi.mocked(window.ariadne.todoistFetch).mockResolvedValue({
      ok: false,
      error: 'Todoist rejected the token — check it in Settings',
    });
    renderSettings();
    const before = ws().tasks.length;
    await userEvent.click(screen.getByRole('button', { name: 'Import now' }));
    await vi.waitFor(() => {
      expect(useStore.getState().toast).toMatch(/rejected the token/);
    });
    expect(ws().tasks).toHaveLength(before);
    expect(ws().settings.lastTodoistImportAt).toBeNull();
  });

  it('reports an in-sync workspace on an empty diff', async () => {
    vi.mocked(window.ariadne.todoistFetch).mockResolvedValue({ ok: true, items: [] });
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Import now' }));
    await vi.waitFor(() => {
      expect(useStore.getState().toast).toBe('Todoist is already in sync');
    });
  });
});
