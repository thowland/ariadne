import { clearAll, createTask, updateSettings } from '@shared/domain/mutate';
import { seedWorkspace } from '@shared/domain/seed';
import type { AriadneApi } from '@shared/ipc-contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useStore } from './store';

const TODAY = '2026-07-08';

function installApiMock(overrides: Partial<AriadneApi> = {}): AriadneApi {
  const api: AriadneApi = {
    loadWorkspace: vi.fn().mockResolvedValue({
      workspace: seedWorkspace(TODAY),
      warnings: [],
      firstRun: true,
    }),
    saveCollections: vi.fn().mockResolvedValue({ rejected: [] }),
    onSaveStatus: vi.fn(),
    getDataDir: vi.fn().mockResolvedValue({ path: '/tmp/data' }),
    openExternal: vi.fn().mockResolvedValue(undefined),
    saveBlob: vi.fn().mockResolvedValue({ size: 0 }),
    deleteBlobs: vi.fn().mockResolvedValue(undefined),
    downloadFile: vi.fn().mockResolvedValue({ savedPath: null }),
    exportWorkspace: vi.fn().mockResolvedValue({ savedPath: null }),
    importFromFile: vi
      .fn()
      .mockResolvedValue({ ok: false, error: 'Import cancelled', cancelled: true }),
    importFromText: vi.fn().mockResolvedValue({ ok: false, error: 'Invalid JSON — import failed' }),
    chooseDataDir: vi
      .fn()
      .mockResolvedValue({ mode: 'unchanged', path: '/tmp/data', relaunching: false }),
    todoistCompleted: vi
      .fn()
      .mockResolvedValue({ ok: false, error: 'Add your Todoist API token first' }),
    todoistPush: vi.fn().mockResolvedValue({ ok: true, pushed: [], failed: 0 }),
    runBackupNow: vi.fn().mockResolvedValue({ ok: true, path: '/tmp/data/backups/2026-07-08' }),
    chooseBackupDir: vi.fn().mockResolvedValue({ path: null }),
    aiExtract: vi
      .fn()
      .mockResolvedValue({ ok: false, error: 'Add your Anthropic API key in Settings first' }),
    logEvent: vi.fn(),
    chooseLogDir: vi.fn().mockResolvedValue({ path: null }),
    revealLogFile: vi.fn().mockResolvedValue({ ok: true }),
    getLogInfo: vi.fn().mockResolvedValue({ defaultDir: '/tmp/userData/logs' }),
    fakeToday: TODAY,
    ...overrides,
  };
  window.ariadne = api;
  return api;
}

beforeEach(() => {
  useStore.setState({
    workspace: null,
    today: TODAY,
    loaded: false,
    firstRun: false,
    warnings: [],
    view: 'home',
    activeProjectId: null,
    q: '',
    scope: 'all',
    toast: null,
    saveBroken: false,
  });
});

describe('store.load', () => {
  it('loads the workspace and pins today from fakeToday', async () => {
    installApiMock();
    await useStore.getState().load();
    const s = useStore.getState();
    expect(s.loaded).toBe(true);
    expect(s.firstRun).toBe(true);
    expect(s.today).toBe(TODAY);
    expect(s.workspace?.projects).toHaveLength(6);
  });

  it('surfaces load warnings', async () => {
    installApiMock({
      loadWorkspace: vi.fn().mockResolvedValue({
        workspace: seedWorkspace(TODAY),
        warnings: ['tasks.json restored from backup'],
        firstRun: false,
      }),
    });
    await useStore.getState().load();
    expect(useStore.getState().warnings).toEqual(['tasks.json restored from backup']);
  });
});

describe('store.apply', () => {
  it('applies a mutation and writes only the changed collections through', async () => {
    const api = installApiMock();
    await useStore.getState().load();

    const result = useStore
      .getState()
      .apply((ws, ctx) => createTask(ws, ctx, 'p1', { title: 'From store' }));

    expect(result?.id).toBeTruthy();
    const s = useStore.getState();
    expect(s.workspace?.tasks.some((t) => t.title === 'From store')).toBe(true);

    expect(api.saveCollections).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(api.saveCollections).mock.calls[0]?.[0];
    expect(Object.keys(payload ?? {})).toEqual(['tasks']);
    expect(payload?.tasks?.some((t) => t.title === 'From store')).toBe(true);
  });

  it('uses the pinned today for stamping', async () => {
    installApiMock();
    await useStore.getState().load();
    useStore
      .getState()
      .apply((ws, ctx) => createTask(ws, ctx, 'p1', { title: 'Stamped', status: 'Done' }));
    const t = useStore.getState().workspace?.tasks.find((x) => x.title === 'Stamped');
    expect(t?.completedAt).toBe(TODAY);
  });

  it('returns null before the workspace is loaded', () => {
    installApiMock();
    const r = useStore.getState().apply((ws) => updateSettings(ws, { todoistToken: 'x' }));
    expect(r).toBeNull();
  });

  it('skips persistence for no-op mutations', async () => {
    const api = installApiMock();
    await useStore.getState().load();
    useStore.getState().apply((ws) => ({ workspace: ws, changed: [] }));
    expect(api.saveCollections).not.toHaveBeenCalled();
  });

  it('forwards replaceAll to the save payload for wipe-and-replace mutations', async () => {
    const api = installApiMock();
    await useStore.getState().load();

    useStore.getState().apply((ws) => clearAll(ws));
    const payload = vi.mocked(api.saveCollections).mock.calls[0]?.[0];
    expect(payload?.replaceAll).toBe(true);
    expect(payload?.projects).toEqual([]);

    // Ordinary mutations never carry the flag.
    useStore.getState().apply((ws, ctx) => createTask(ws, ctx, 'p1', { title: 'x' }));
    expect(vi.mocked(api.saveCollections).mock.calls[1]?.[0]?.replaceAll).toBeUndefined();
  });

  it('toasts when the main process rejects a write', async () => {
    const api = installApiMock({
      saveCollections: vi.fn().mockResolvedValue({
        rejected: [{ name: 'tasks', reason: 'tasks payload failed validation' }],
      }),
    });
    await useStore.getState().load();
    useStore.getState().apply((ws, ctx) => createTask(ws, ctx, 'p1', { title: 'y' }));
    await vi.waitFor(() => {
      expect(useStore.getState().toast).toMatch(/NOT saved \(tasks\)/);
    });
    expect(api.saveCollections).toHaveBeenCalledTimes(1);
  });
});

describe('store.refreshToday', () => {
  it('re-reads the clock (fake pin wins)', () => {
    installApiMock({ fakeToday: '2030-01-02' });
    useStore.getState().refreshToday();
    expect(useStore.getState().today).toBe('2030-01-02');
  });
});

describe('ui slice', () => {
  it('go() switches views and clears the search query', () => {
    useStore.setState({ q: 'something' });
    useStore.getState().go('calendar');
    expect(useStore.getState().view).toBe('calendar');
    expect(useStore.getState().q).toBe('');
  });

  it('openProject navigates; openTask opens the editor modal', async () => {
    installApiMock();
    await useStore.getState().load();

    useStore.getState().openProject('p3');
    expect(useStore.getState().view).toBe('project');
    expect(useStore.getState().activeProjectId).toBe('p3');

    useStore.getState().openTask('t1');
    expect(useStore.getState().modal).toEqual({ type: 'task', id: 't1' });
    useStore.getState().closeModal();
    expect(useStore.getState().modal).toBeNull();

    useStore.getState().openTask('ghost'); // unknown ids are ignored
    expect(useStore.getState().modal).toBeNull();
  });

  it('askConfirm resolves through resolveConfirm', async () => {
    const promise = useStore.getState().askConfirm('Delete?');
    expect(useStore.getState().confirmState?.message).toBe('Delete?');
    useStore.getState().resolveConfirm(true);
    await expect(promise).resolves.toBe(true);
    expect(useStore.getState().confirmState).toBeNull();
  });

  it('showToast auto-clears after ~2.6s', () => {
    vi.useFakeTimers();
    try {
      useStore.getState().showToast('Saved');
      expect(useStore.getState().toast).toBe('Saved');
      vi.advanceTimersByTime(2700);
      expect(useStore.getState().toast).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('newProject creates, navigates, and toasts', async () => {
    installApiMock();
    await useStore.getState().load();
    useStore.getState().newProject();
    const s = useStore.getState();
    expect(s.view).toBe('project');
    expect(s.workspace?.projects.some((p) => p.name === 'Untitled project')).toBe(true);
    expect(s.toast).toBe('Project created');
  });

  it('newTaskGlobal targets the active project, falling back to the first', async () => {
    installApiMock();
    await useStore.getState().load();

    useStore.setState({ activeProjectId: 'p4' });
    useStore.getState().newTaskGlobal();
    const tasks = useStore.getState().workspace?.tasks ?? [];
    expect(tasks[tasks.length - 1]?.projectId).toBe('p4');
    // The new task opens in the editor modal (prototype behavior).
    const modal = useStore.getState().modal;
    expect(modal?.type === 'task' && modal.id).toBe(tasks[tasks.length - 1]?.id);
    useStore.getState().closeModal();

    useStore.setState({ activeProjectId: null });
    useStore.getState().newTaskGlobal();
    const tasks2 = useStore.getState().workspace?.tasks ?? [];
    expect(tasks2[tasks2.length - 1]?.projectId).toBe('p1');
  });

  it('newTaskGlobal on an empty workspace creates a project instead', async () => {
    installApiMock({
      loadWorkspace: vi.fn().mockResolvedValue({
        workspace: {
          projects: [],
          tasks: [],
          files: [],
          settings: { todoistToken: '', lastTodoistSyncAt: null },
        },
        warnings: [],
        firstRun: false,
      }),
    });
    await useStore.getState().load();
    useStore.getState().newTaskGlobal();
    expect(useStore.getState().workspace?.projects).toHaveLength(1);
    expect(useStore.getState().workspace?.tasks).toHaveLength(0);
  });
});

describe('debug activity logging (D18)', () => {
  it('stays silent while the toggle is off, then reports edits with size deltas', async () => {
    const api = installApiMock();
    await useStore.getState().load();

    useStore.getState().apply((ws, ctx) => createTask(ws, ctx, 'p1', { title: 'quiet' }));
    expect(api.logEvent).not.toHaveBeenCalled();

    // The enabling edit itself is the first logged activity.
    useStore.getState().apply((ws) => updateSettings(ws, { debugLogging: true }));
    expect(api.logEvent).toHaveBeenCalledWith('activity', 'edit applied: settings');

    useStore.getState().apply((ws, ctx) => createTask(ws, ctx, 'p1', { title: 'loud' }));
    const last = vi.mocked(api.logEvent).mock.calls.at(-1);
    expect(last?.[0]).toBe('activity');
    expect(last?.[1]).toMatch(/^edit applied: tasks \d+→\d+$/);
  });

  it('turning the toggle off logs nothing, including the disabling edit', async () => {
    const api = installApiMock();
    await useStore.getState().load();
    useStore.getState().apply((ws) => updateSettings(ws, { debugLogging: true }));
    vi.mocked(api.logEvent).mockClear();

    useStore.getState().apply((ws) => updateSettings(ws, { debugLogging: false }));
    useStore.getState().apply((ws, ctx) => createTask(ws, ctx, 'p1', { title: 'silent again' }));
    expect(api.logEvent).not.toHaveBeenCalled();
  });

  it('logs navigation only while enabled', async () => {
    const api = installApiMock();
    await useStore.getState().load();

    useStore.getState().go('reports');
    expect(api.logEvent).not.toHaveBeenCalled();

    useStore.getState().apply((ws) => updateSettings(ws, { debugLogging: true }));
    useStore.getState().go('settings');
    expect(api.logEvent).toHaveBeenLastCalledWith('activity', 'navigate: settings');
    useStore.getState().openProject('p1');
    expect(api.logEvent).toHaveBeenLastCalledWith('activity', 'navigate: project p1');
    useStore.getState().openTask('t1');
    expect(api.logEvent).toHaveBeenLastCalledWith('activity', 'open task t1');
  });
});
