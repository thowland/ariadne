import { writeFile } from 'node:fs/promises';
import { copyFile } from 'node:fs/promises';

import { todayIso } from '@shared/domain/clock';
import { seedWorkspace } from '@shared/domain/seed';
import { IPC } from '@shared/ipc-contract';
import type { WorkspaceLoadResponse, WorkspaceSavePayload } from '@shared/ipc-contract';
import type { DownloadRequest, DownloadResponse } from '@shared/ipc-contract';
import { dialog, ipcMain, shell } from 'electron';
import { app } from 'electron';

import { AiExtractService } from './services/ai-extract-service';
import type { BackupService } from './services/backup-service';
import type { BlobService } from './services/blob-service';
import type { ConfigService } from './services/config-service';
import { ImportExportService } from './services/import-export-service';
import type { StorageService } from './services/storage-service';
import { TodoistPushService, TodoistService } from './services/todoist-service';

/**
 * Thin glue: ipcMain.handle registrations → services. No logic beyond
 * routing; excluded from unit coverage and exercised by the E2E suite.
 */
export function registerIpc(
  storage: StorageService,
  backups: BackupService,
  blobs: BlobService,
  config: ConfigService,
  dataDir: string,
): void {
  const importExport = new ImportExportService(storage, blobs);
  const todoist = new TodoistService();
  const todoistPush = new TodoistPushService(todoist);
  const aiExtract = new AiExtractService();

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
    // The renderer is the only caller, but this is still an untrusted
    // boundary: screen every collection before it can reach disk.
    const rejected = storage.savePayload(payload);
    return { rejected };
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

  ipcMain.handle(IPC.exportRun, async () => {
    const today = todayIso(process.env.ARIADNE_FAKE_TODAY);
    const picked = await dialog.showSaveDialog({ defaultPath: `ariadne-export-${today}.json` });
    if (picked.canceled || picked.filePath === '') return { savedPath: null };
    const result = await importExport.exportTo(picked.filePath);
    return result.ok
      ? { savedPath: picked.filePath }
      : { savedPath: null, error: result.error ?? 'Export failed' };
  });

  ipcMain.handle(IPC.importFromFile, async () => {
    const picked = await dialog.showOpenDialog({
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });
    const path = picked.filePaths[0];
    if (picked.canceled || path === undefined) {
      return { ok: false, error: 'Import cancelled', cancelled: true };
    }
    return importExport.importFromFile(path);
  });

  ipcMain.handle(IPC.importFromText, (_event, text: string) => importExport.importFromText(text));

  ipcMain.handle(IPC.backupRun, async () => {
    await storage.flushAll();
    return backups.runBackup();
  });

  ipcMain.handle(IPC.backupDirChoose, async () => {
    const picked = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: backups.resolveConfig().backupDir,
    });
    const path = picked.filePaths[0];
    return { path: picked.canceled || path === undefined ? null : path };
  });

  ipcMain.handle(
    IPC.todoistCompleted,
    (_event, payload: { token: string; since: string; until: string }) =>
      todoist.fetchCompleted(
        typeof payload.token === 'string' ? payload.token : '',
        payload.since,
        payload.until,
      ),
  );

  ipcMain.handle(
    IPC.todoistPush,
    (
      _event,
      payload: { token: string; items: import('@shared/domain/todoist').TodoistPushCandidate[] },
    ) => todoistPush.pushTasks(payload.token, payload.items),
  );

  ipcMain.handle(
    IPC.aiExtract,
    (_event, request: { apiKey?: unknown; text?: unknown; projectNames?: unknown }) =>
      aiExtract.extractTasks(
        typeof request.apiKey === 'string' ? request.apiKey : '',
        typeof request.text === 'string' ? request.text : '',
        Array.isArray(request.projectNames)
          ? request.projectNames.filter((n): n is string => typeof n === 'string')
          : [],
        todayIso(process.env.ARIADNE_FAKE_TODAY),
      ),
  );

  ipcMain.handle(IPC.dataDirChoose, async () => {
    const picked = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: dataDir,
    });
    const target = picked.filePaths[0];
    if (picked.canceled || target === undefined) {
      return { mode: 'unchanged', path: dataDir, relaunching: false };
    }
    await storage.flushAll();
    const mode = config.changeDataDir(dataDir, target);
    if (mode === 'unchanged') return { mode, path: dataDir, relaunching: false };
    // The new directory takes effect on relaunch (all services re-bind).
    setTimeout(() => {
      app.relaunch();
      app.quit();
    }, 400);
    return { mode, path: target, relaunching: true };
  });

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
