import { writeFile } from 'node:fs/promises';
import { copyFile } from 'node:fs/promises';

import { todayIso } from '@shared/domain/clock';
import { seedWorkspace } from '@shared/domain/seed';
import { IPC } from '@shared/ipc-contract';
import type { WorkspaceLoadResponse, WorkspaceSavePayload } from '@shared/ipc-contract';
import type { DownloadRequest, DownloadResponse } from '@shared/ipc-contract';
import { COLLECTION_NAMES } from '@shared/types';
import { dialog, ipcMain, shell } from 'electron';

import type { BlobService } from './services/blob-service';
import type { StorageService } from './services/storage-service';

/**
 * Thin glue: ipcMain.handle registrations → services. No logic beyond
 * routing; excluded from unit coverage and exercised by the E2E suite.
 */
export function registerIpc(storage: StorageService, blobs: BlobService, dataDir: string): void {
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

  ipcMain.handle(
    IPC.blobSave,
    (_event, payload: { fileId: string; ext: string; bytes: Uint8Array }) =>
      blobs.save(payload.fileId, payload.ext, payload.bytes),
  );

  ipcMain.handle(IPC.blobDelete, (_event, payload: { fileIds: string[] }) =>
    blobs.deleteMany(payload.fileIds),
  );

  ipcMain.handle(
    IPC.fileDownload,
    async (_event, request: DownloadRequest): Promise<DownloadResponse> => {
      const picked = await dialog.showSaveDialog({ defaultPath: request.suggestedName });
      if (picked.canceled || picked.filePath === '') return { savedPath: null };
      try {
        if (request.content !== undefined) {
          await writeFile(picked.filePath, request.content, 'utf8');
        } else if (request.fileId !== undefined) {
          const source = blobs.find(request.fileId);
          if (source === null) return { savedPath: null, error: 'No stored file to download' };
          await copyFile(source, picked.filePath);
        } else {
          return { savedPath: null, error: 'Nothing to download' };
        }
        return { savedPath: picked.filePath };
      } catch (err) {
        return { savedPath: null, error: err instanceof Error ? err.message : 'Download failed' };
      }
    },
  );
}
