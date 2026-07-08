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
