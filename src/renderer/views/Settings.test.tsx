import { seedWorkspace } from '@shared/domain/seed';
import { markTasksPushed } from '@shared/domain/todoist';
import { fireEvent, render, screen } from '@testing-library/react';
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
    await userEvent.click(screen.getByRole('button', { name: 'Change data folder' }));
    await vi.waitFor(() => {
      expect(useStore.getState().toast).toMatch(/Data migrated/);
    });
    expect(screen.getByTestId('data-dir')).toHaveTextContent('/somewhere/synced');
  });
});

describe('Settings — Todoist completion sync', () => {
  /** Seeded workspace with a stored token and t6 already pushed (todoist:555). */
  function loadPushedWorkspace() {
    const w = seedWorkspace(TEST_TODAY);
    w.settings = { ...w.settings, todoistToken: 'tok123' };
    loadTestWorkspace(markTasksPushed(w, [{ taskId: 't6', todoistId: '555' }]).workspace);
  }

  it('marks pushed tasks Done with the Todoist completion date and stamps the sync', async () => {
    loadPushedWorkspace();
    vi.mocked(window.ariadne.todoistCompleted).mockResolvedValue({
      ok: true,
      items: [{ todoistId: '555', completedDate: '2026-07-07' }],
    });
    renderSettings();

    await userEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    await vi.waitFor(() => {
      expect(useStore.getState().toast).toBe('Marked 1 task done from Todoist');
    });
    expect(ws().tasks.find((t) => t.id === 't6')).toMatchObject({
      status: 'Done',
      completedAt: '2026-07-07',
    });
    expect(ws().settings.lastTodoistSyncAt).not.toBeNull();
    expect(screen.getByTestId('todoist-last-sync')).toBeInTheDocument();
    // Called with the stored token and a since/until window.
    const call = vi.mocked(window.ariadne.todoistCompleted).mock.calls[0];
    expect(call?.[0]).toBe('tok123');
    expect(Date.parse(call?.[1] ?? '')).toBeLessThan(Date.parse(call?.[2] ?? ''));
  });

  it('surfaces sync errors but still stamps the attempt', async () => {
    loadPushedWorkspace();
    vi.mocked(window.ariadne.todoistCompleted).mockResolvedValue({
      ok: false,
      error: 'Todoist rejected the token — check it in Settings',
    });
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    await vi.waitFor(() => {
      expect(useStore.getState().toast).toMatch(/rejected the token/);
    });
    expect(ws().tasks.find((t) => t.id === 't6')?.status).not.toBe('Done');
    expect(ws().settings.lastTodoistSyncAt).not.toBeNull();
  });

  it('reports a quiet sync when nothing new was completed', async () => {
    loadPushedWorkspace();
    vi.mocked(window.ariadne.todoistCompleted).mockResolvedValue({ ok: true, items: [] });
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    await vi.waitFor(() => {
      expect(useStore.getState().toast).toBe('Nothing new completed in Todoist');
    });
  });

  it('recovers from an IPC-level rejection with a toast, still stamping the attempt', async () => {
    loadPushedWorkspace();
    vi.mocked(window.ariadne.todoistCompleted).mockRejectedValue(new Error('ipc boom'));
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    await vi.waitFor(() => {
      expect(useStore.getState().toast).toBe('Todoist sync failed unexpectedly — try again');
    });
    expect(ws().settings.lastTodoistSyncAt).not.toBeNull();
    expect(useStore.getState().todoistSyncing).toBe(false);
  });

  it('refuses to sync without a token, and persists the schedule choice', async () => {
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    expect(useStore.getState().toast).toBe('Add your Todoist API token first');
    expect(window.ariadne.todoistCompleted).not.toHaveBeenCalled();

    await userEvent.selectOptions(screen.getByLabelText('Todoist sync schedule'), 'daily');
    expect(ws().settings.todoistSyncEvery).toBe('daily');
  });
});

describe('Settings — Backups', () => {
  it('shows the default folder, retention, and daily copy', async () => {
    renderSettings();
    await vi.waitFor(() => {
      expect(screen.getByTestId('backup-dir')).toHaveTextContent('/tmp/data/backups (default)');
    });
    expect(screen.getByLabelText('Backups to keep')).toHaveValue(10);
  });

  it('changes and resets the backup folder', async () => {
    vi.mocked(window.ariadne.chooseBackupDir).mockResolvedValue({ path: '/synced/backups' });
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Change backup folder' }));
    await vi.waitFor(() => {
      expect(ws().settings.backupDir).toBe('/synced/backups');
    });
    expect(screen.getByTestId('backup-dir')).toHaveTextContent('/synced/backups');

    await userEvent.click(screen.getByRole('button', { name: 'Use default' }));
    expect(ws().settings.backupDir).toBeNull();
  });

  it('a cancelled folder dialog changes nothing', async () => {
    renderSettings(); // default mock resolves { path: null }
    await userEvent.click(screen.getByRole('button', { name: 'Change backup folder' }));
    await vi.waitFor(() => {
      expect(vi.mocked(window.ariadne.chooseBackupDir)).toHaveBeenCalled();
    });
    expect(ws().settings.backupDir).toBeNull();
  });

  it('clamps the retention count to 1..100', () => {
    renderSettings();
    const input = screen.getByLabelText('Backups to keep');
    fireEvent.change(input, { target: { value: '250' } });
    expect(ws().settings.backupKeep).toBe(100);

    fireEvent.change(input, { target: { value: '25' } });
    expect(ws().settings.backupKeep).toBe(25);

    fireEvent.change(input, { target: { value: '0' } });
    expect(ws().settings.backupKeep).toBe(1);
  });

  it('Back up now reports the result', async () => {
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Back up now' }));
    await vi.waitFor(() => {
      expect(useStore.getState().toast).toBe('Backed up to /tmp/data/backups/2026-07-08');
    });

    vi.mocked(window.ariadne.runBackupNow).mockResolvedValue({
      ok: false,
      error: 'Nothing to back up yet',
    });
    await userEvent.click(screen.getByRole('button', { name: 'Back up now' }));
    await vi.waitFor(() => {
      expect(useStore.getState().toast).toBe('Nothing to back up yet');
    });
  });
});

describe('Settings — Todoist push', () => {
  it('previews the candidate count for the configured window', () => {
    renderSettings();
    // Seed, today ±7d: several unsent dated open tasks exist.
    expect(screen.getByTestId('push-preview')).not.toHaveTextContent('0 tasks');
    expect(screen.getByLabelText('Push window in days')).toHaveValue(7);
  });

  it('clamps the day window and persists it', () => {
    renderSettings();
    const input = screen.getByLabelText('Push window in days');
    fireEvent.change(input, { target: { value: '90' } });
    expect(ws().settings.todoistPushDays).toBe(60);
    fireEvent.change(input, { target: { value: '3' } });
    expect(ws().settings.todoistPushDays).toBe(3);
  });

  it('pushes candidates, marks them, and toasts the count', async () => {
    vi.mocked(window.ariadne.todoistPush).mockImplementation((_token, items) =>
      Promise.resolve({
        ok: true,
        pushed: items.map((i) => ({ taskId: i.taskId, todoistId: `td-${i.taskId}` })),
        failed: 0,
      }),
    );
    renderSettings();
    const before = Number(/^(\d+)/.exec(screen.getByTestId('push-preview').textContent)?.[1]);
    expect(before).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: 'Push to Todoist' }));
    await vi.waitFor(() => {
      expect(useStore.getState().toast).toBe(`Pushed ${before} tasks to Todoist`);
    });
    // All candidates now carry markers → preview drops to zero.
    expect(screen.getByTestId('push-preview')).toHaveTextContent('0 tasks ready to push');
    const marked = ws().tasks.filter((t) => t.notes.includes('todoist:td-'));
    expect(marked).toHaveLength(before);
  });

  it('reports partial failures and surfaces push errors', async () => {
    vi.mocked(window.ariadne.todoistPush).mockResolvedValue({
      ok: true,
      pushed: [{ taskId: 't6', todoistId: 'x1' }],
      failed: 2,
    });
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Push to Todoist' }));
    await vi.waitFor(() => {
      expect(useStore.getState().toast).toBe('Pushed 1 of 3 tasks to Todoist');
    });

    vi.mocked(window.ariadne.todoistPush).mockResolvedValue({
      ok: false,
      error: 'Todoist rejected the token — check it in Settings',
    });
    await userEvent.click(screen.getByRole('button', { name: 'Push to Todoist' }));
    await vi.waitFor(() => {
      expect(useStore.getState().toast).toMatch(/rejected the token/);
    });

    vi.mocked(window.ariadne.todoistPush).mockRejectedValue(new Error('ipc boom'));
    await userEvent.click(screen.getByRole('button', { name: 'Push to Todoist' }));
    await vi.waitFor(() => {
      expect(useStore.getState().toast).toBe('Todoist push failed unexpectedly — try again');
    });
  });

  it('declines to push when nothing is in the window', async () => {
    const w0 = ws();
    loadTestWorkspace({ ...w0, tasks: w0.tasks.map((t) => ({ ...t, dueDate: null })) });
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Push to Todoist' }));
    expect(useStore.getState().toast).toMatch(/Nothing to push/);
    expect(window.ariadne.todoistPush).not.toHaveBeenCalled();
  });
});

describe('Settings — Claude AI', () => {
  it('saves the Anthropic API key and opens the import wizard', async () => {
    renderSettings();
    await userEvent.type(screen.getByLabelText('Anthropic API key'), 'sk-ant-abc');
    expect(ws().settings.anthropicApiKey).toBe('sk-ant-abc');

    await userEvent.click(screen.getByRole('button', { name: 'Import tasks…' }));
    expect(useStore.getState().modal).toEqual({ type: 'aiImport' });
  });
});

describe('Settings — Debug logging', () => {
  it('shows the default log folder and toggles the setting', async () => {
    renderSettings();
    await vi.waitFor(() => {
      expect(screen.getByTestId('log-dir')).toHaveTextContent('/tmp/userData/logs (default)');
    });
    const toggle = screen.getByLabelText('Enable debug logging');
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    expect(ws().settings.debugLogging).toBe(true);
    await userEvent.click(toggle);
    expect(ws().settings.debugLogging).toBe(false);
  });

  it('changes and resets the log folder', async () => {
    vi.mocked(window.ariadne.chooseLogDir).mockResolvedValue({ path: '/var/log/ariadne' });
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Change log folder' }));
    await vi.waitFor(() => {
      expect(ws().settings.debugLogDir).toBe('/var/log/ariadne');
    });
    expect(screen.getByTestId('log-dir')).toHaveTextContent('/var/log/ariadne');

    await userEvent.click(screen.getByRole('button', { name: 'Use default' }));
    expect(ws().settings.debugLogDir).toBeNull();
  });

  it('a cancelled log-folder dialog changes nothing', async () => {
    renderSettings(); // default mock resolves { path: null }
    await userEvent.click(screen.getByRole('button', { name: 'Change log folder' }));
    await vi.waitFor(() => {
      expect(vi.mocked(window.ariadne.chooseLogDir)).toHaveBeenCalled();
    });
    expect(ws().settings.debugLogDir).toBeNull();
  });

  it('Show log file toasts the error when there is no log yet', async () => {
    vi.mocked(window.ariadne.revealLogFile).mockResolvedValue({
      ok: false,
      error: 'No log file yet — enable debug logging first',
    });
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Show log file' }));
    await vi.waitFor(() => {
      expect(useStore.getState().toast).toBe('No log file yet — enable debug logging first');
    });

    vi.mocked(window.ariadne.revealLogFile).mockResolvedValue({ ok: true });
    useStore.setState({ toast: null });
    await userEvent.click(screen.getByRole('button', { name: 'Show log file' }));
    await vi.waitFor(() => {
      expect(vi.mocked(window.ariadne.revealLogFile)).toHaveBeenCalledTimes(2);
    });
    expect(useStore.getState().toast).toBeNull();
  });
});
