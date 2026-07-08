import { todayIso } from '@shared/domain/clock';
import { seedWorkspace } from '@shared/domain/seed';
import type { WorkspaceLoadResponse, WorkspaceSavePayload } from '@shared/ipc-contract';
import { IPC } from '@shared/ipc-contract';
import { COLLECTION_NAMES } from '@shared/types';
import { ipcMain, shell } from 'electron';

import type { StorageService } from './services/storage-service';

/**
 * Thin glue: ipcMain.handle registrations → services. No logic beyond
 * routing; excluded from unit coverage and exercised by the E2E suite.
 */
export function registerIpc(storage: StorageService, dataDir: string): void {
  ipcMain.handle(IPC.workspaceLoad, async (): Promise<WorkspaceLoadResponse> => {
    const loaded = await storage.loadWorkspace();
    if (loaded.workspace !== null) {
      return { workspace: loaded.workspace, warnings: loaded.warnings, firstRun: false };
    }
    // First run: seed the sample dataset (honoring the E2E fake-today pin).
    const seeded = seedWorkspace(todayIso(process.env.ARIADNE_FAKE_TODAY));
    await storage.saveWorkspaceNow(seeded);
    return { workspace: seeded, warnings: loaded.warnings, firstRun: true };
  });

  ipcMain.handle(IPC.workspaceSave, (_event, payload: WorkspaceSavePayload) => {
    for (const name of COLLECTION_NAMES) {
      const data = payload[name];
      if (data !== undefined) storage.scheduleSave(name, data);
    }
  });

  ipcMain.handle(IPC.dataDirGet, () => ({ path: dataDir }));

  ipcMain.handle(IPC.openExternal, (_event, url: unknown) => {
    if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
      void shell.openExternal(url);
    }
  });
}
