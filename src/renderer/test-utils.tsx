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
    saveCollections: vi.fn().mockResolvedValue({ rejected: [] }),
    onSaveStatus: vi.fn(),
    getDataDir: vi.fn().mockResolvedValue({ path: '/tmp/data' }),
    getAppInfo: vi.fn().mockResolvedValue({
      version: '1.14.0',
      electron: '39.8.10',
      chrome: '140.0.0.0',
      node: '18.19.0',
      platform: 'linux',
      dataDir: '/tmp/data',
    }),
    onMenuCommand: vi.fn(),
    openExternal: vi.fn().mockResolvedValue(undefined),
    saveBlob: vi.fn().mockResolvedValue({ size: 0 }),
    deleteBlobs: vi.fn().mockResolvedValue(undefined),
    downloadFile: vi.fn().mockResolvedValue({ savedPath: null }),
    exportReportPdf: vi.fn().mockResolvedValue({ savedPath: null }),
    exportWorkspace: vi.fn().mockResolvedValue({ savedPath: null }),
    exportArchive: vi.fn().mockResolvedValue({ savedPath: null }),
    importArchive: vi
      .fn()
      .mockResolvedValue({ ok: false, error: 'Import cancelled', cancelled: true }),
    importFromFile: vi
      .fn()
      .mockResolvedValue({ ok: false, error: 'Import cancelled', cancelled: true }),
    importFromText: vi.fn().mockResolvedValue({ ok: false, error: 'Invalid JSON — import failed' }),
    pickCsvFile: vi
      .fn()
      .mockResolvedValue({ ok: false, error: 'Import cancelled', cancelled: true }),
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
    setBadge: vi.fn().mockResolvedValue(undefined),
    setNativeTheme: vi.fn().mockResolvedValue(undefined),
    fakeToday: TEST_TODAY,
    insetTitlebar: false,
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
    activeContactId: null,
    q: '',
    scope: 'all',
    toast: null,
    saveBroken: false,
    modal: null,
    confirmState: null,
    calMonth: null,
    calMode: 'month',
    calWeek: null,
  });
  return api;
}

/** Shortcut: mark the store as loaded with the given workspace. */
export function loadTestWorkspace(workspace: Workspace = seedWorkspace(TEST_TODAY)): void {
  useStore.setState({ workspace, loaded: true, today: TEST_TODAY });
}
