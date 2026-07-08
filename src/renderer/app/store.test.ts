import { createTask, updateSettings } from '@shared/domain/mutate';
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
    saveCollections: vi.fn().mockResolvedValue(undefined),
    getDataDir: vi.fn().mockResolvedValue({ path: '/tmp/data' }),
    openExternal: vi.fn().mockResolvedValue(undefined),
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

  it('openProject / openTask navigate to the project view', async () => {
    installApiMock();
    await useStore.getState().load();

    useStore.getState().openProject('p3');
    expect(useStore.getState().view).toBe('project');
    expect(useStore.getState().activeProjectId).toBe('p3');

    useStore.getState().openTask('t1'); // t1 lives in p1
    expect(useStore.getState().activeProjectId).toBe('p1');
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
          settings: { todoistToken: '', lastTodoistImportAt: null },
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
