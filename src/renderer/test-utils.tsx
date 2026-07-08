import { seedWorkspace } from '@shared/domain/seed';
import type { AriadneApi } from '@shared/ipc-contract';
import type { Workspace } from '@shared/types';
import { vi } from 'vitest';

import { useStore } from './app/store';

export const TEST_TODAY = '2026-07-08';

/** Install a mock window.ariadne and reset the store to a clean slate. */
export function setupTestApp(
  workspace: Workspace = seedWorkspace(TEST_TODAY),
  overrides: Partial<AriadneApi> = {},
): AriadneApi {
  const api: AriadneApi = {
    loadWorkspace: vi.fn().mockResolvedValue({ workspace, warnings: [], firstRun: false }),
    saveCollections: vi.fn().mockResolvedValue(undefined),
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
    fakeToday: TEST_TODAY,
    ...overrides,
  };
  window.ariadne = api;
  useStore.setState({
    workspace: null,
    today: TEST_TODAY,
    loaded: false,
    firstRun: false,
    warnings: [],
    view: 'home',
    activeProjectId: null,
    q: '',
    scope: 'all',
    toast: null,
    modal: null,
    confirmState: null,
  });
  return api;
}

/** Shortcut: mark the store as loaded with the given workspace. */
export function loadTestWorkspace(workspace: Workspace = seedWorkspace(TEST_TODAY)): void {
  useStore.setState({ workspace, loaded: true, today: TEST_TODAY });
}
