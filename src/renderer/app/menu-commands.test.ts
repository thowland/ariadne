import { seedWorkspace } from '@shared/domain/seed';
import { MENU_COMMANDS } from '@shared/ipc-contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadTestWorkspace, setupTestApp, TEST_TODAY } from '../test-utils';

import { runMenuCommand } from './menu-commands';
import { useStore } from './store';

let api: ReturnType<typeof setupTestApp>;

beforeEach(() => {
  api = setupTestApp();
  loadTestWorkspace();
});

/** Let the async IO helpers settle. */
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('runMenuCommand', () => {
  it('handles every command in the shared contract without throwing', () => {
    for (const command of MENU_COMMANDS) {
      expect(() => {
        runMenuCommand(command);
      }).not.toThrow();
    }
  });

  it('opens the About and Help windows', () => {
    runMenuCommand('about');
    expect(useStore.getState().modal).toEqual({ type: 'about' });
    runMenuCommand('help');
    expect(useStore.getState().modal).toEqual({ type: 'help', section: 'start' });
    runMenuCommand('shortcuts');
    expect(useStore.getState().modal).toEqual({ type: 'help', section: 'shortcuts' });
  });

  it('navigates and rescopes', () => {
    for (const [command, view] of [
      ['goCalendar', 'calendar'],
      ['goReports', 'reports'],
      ['goFiles', 'files'],
      ['goTags', 'tags'],
      ['goSettings', 'settings'],
      ['goHome', 'home'],
    ] as const) {
      runMenuCommand(command);
      expect(useStore.getState().view).toBe(view);
    }
    runMenuCommand('scopeWork');
    expect(useStore.getState().scope).toBe('work');
    runMenuCommand('scopeHome');
    expect(useStore.getState().scope).toBe('home');
    runMenuCommand('scopeAll');
    expect(useStore.getState().scope).toBe('all');
  });

  it('creates a project and a task', () => {
    const projects = useStore.getState().workspace?.projects.length ?? 0;
    runMenuCommand('newProject');
    expect(useStore.getState().workspace?.projects.length).toBe(projects + 1);

    const tasks = useStore.getState().workspace?.tasks.length ?? 0;
    runMenuCommand('newTask');
    expect(useStore.getState().workspace?.tasks.length).toBe(tasks + 1);
    expect(useStore.getState().modal?.type).toBe('task');
  });

  it('opens the AI import wizard', () => {
    runMenuCommand('aiImport');
    expect(useStore.getState().modal).toEqual({ type: 'aiImport' });
  });

  it('focuses the search box', () => {
    const input = document.createElement('input');
    input.className = 'search-input';
    document.body.append(input);
    runMenuCommand('search');
    expect(document.activeElement).toBe(input);
    input.remove();
  });

  it('runs the archive export and reports what was included', async () => {
    api.exportArchive = vi.fn().mockResolvedValue({
      savedPath: '/tmp/a.zip',
      counts: { projects: 1, tasks: 2, files: 3, blobs: 2 },
    });
    runMenuCommand('exportArchive');
    await settle();
    expect(useStore.getState().toast).toBe('Archive saved — 2 files included');
  });

  it('stays silent when the archive export is cancelled, and surfaces errors', async () => {
    runMenuCommand('exportArchive');
    await settle();
    expect(useStore.getState().toast).toBeNull();

    api.exportArchive = vi.fn().mockResolvedValue({ savedPath: null, error: 'Disk full' });
    runMenuCommand('exportArchive');
    await settle();
    expect(useStore.getState().toast).toBe('Disk full');
  });

  it('confirms before an archive import replaces the workspace', async () => {
    const replacement = seedWorkspace(TEST_TODAY);
    replacement.projects = replacement.projects.slice(0, 1);
    api.importArchive = vi
      .fn()
      .mockResolvedValue({ ok: true, workspace: replacement, warnings: [], blobs: 4 });

    runMenuCommand('importArchive');
    await settle();
    // Nothing happens until the confirm resolves.
    expect(api.importArchive).not.toHaveBeenCalled();
    expect(useStore.getState().confirmState).not.toBeNull();

    useStore.getState().resolveConfirm(true);
    await settle();
    expect(useStore.getState().workspace?.projects).toHaveLength(1);
    expect(useStore.getState().view).toBe('home');
    expect(useStore.getState().toast).toContain('4 files');
  });

  it('does nothing when the archive import confirm is declined', async () => {
    runMenuCommand('importArchive');
    await settle();
    useStore.getState().resolveConfirm(false);
    await settle();
    expect(api.importArchive).not.toHaveBeenCalled();
  });

  it('reports an archive import failure but ignores a cancelled dialog', async () => {
    api.importArchive = vi.fn().mockResolvedValue({ ok: false, error: 'Bad archive' });
    runMenuCommand('importArchive');
    await settle();
    useStore.getState().resolveConfirm(true);
    await settle();
    expect(useStore.getState().toast).toBe('Bad archive');

    // A cancelled file dialog is not an error worth a toast.
    useStore.setState({ toast: null });
    api.importArchive = vi
      .fn()
      .mockResolvedValue({ ok: false, error: 'Import cancelled', cancelled: true });
    runMenuCommand('importArchive');
    await settle();
    useStore.getState().resolveConfirm(true);
    await settle();
    expect(useStore.getState().toast).toBeNull();
  });

  it('runs the JSON export and import through the same flows as Settings', async () => {
    api.exportWorkspace = vi.fn().mockResolvedValue({ savedPath: '/tmp/a.json' });
    runMenuCommand('exportJson');
    await settle();
    expect(useStore.getState().toast).toBe('Exported JSON backup');

    const replacement = seedWorkspace(TEST_TODAY);
    replacement.tasks = replacement.tasks.slice(0, 2);
    api.importFromFile = vi
      .fn()
      .mockResolvedValue({ ok: true, workspace: replacement, warnings: [] });
    runMenuCommand('importJson');
    await settle();
    expect(useStore.getState().workspace?.tasks).toHaveLength(2);
  });

  it('backs up on demand and reports the destination', async () => {
    runMenuCommand('backupNow');
    await settle();
    expect(api.runBackupNow).toHaveBeenCalled();
    expect(useStore.getState().toast).toBe('Backed up to /tmp/data/backups/2026-07-08');

    api.runBackupNow = vi.fn().mockResolvedValue({ ok: false, error: 'No space' });
    runMenuCommand('backupNow');
    await settle();
    expect(useStore.getState().toast).toBe('No space');
  });

  it('starts a Todoist sync', async () => {
    runMenuCommand('todoistSync');
    await settle();
    // No token in the seed workspace, so the store says so rather than calling out.
    expect(useStore.getState().toast).toBe('Add your Todoist API token first');
  });

  it('logs to the debug log only when logging is on', () => {
    runMenuCommand('goHome');
    expect(api.logEvent).not.toHaveBeenCalledWith('activity', 'menu: goHome');

    const ws = useStore.getState().workspace!;
    useStore.setState({ workspace: { ...ws, settings: { ...ws.settings, debugLogging: true } } });
    runMenuCommand('goCalendar');
    expect(api.logEvent).toHaveBeenCalledWith('activity', 'menu: goCalendar');
  });
});
