import type { AriadneApi, DownloadRequest, WorkspaceSavePayload } from '@shared/ipc-contract';
import { IPC } from '@shared/ipc-contract';
import { contextBridge, ipcRenderer } from 'electron';

/**
 * The complete surface the renderer sees. Narrow, promise-based, mirroring
 * shared/ipc-contract.ts; no Node primitives leak through.
 */
const api: AriadneApi = {
  loadWorkspace: () => ipcRenderer.invoke(IPC.workspaceLoad),
  saveCollections: (payload: WorkspaceSavePayload) =>
    ipcRenderer.invoke(IPC.workspaceSave, payload),
  getDataDir: () => ipcRenderer.invoke(IPC.dataDirGet),
  openExternal: (url: string) => ipcRenderer.invoke(IPC.openExternal, url),
  saveBlob: (fileId: string, ext: string, bytes: ArrayBuffer) =>
    ipcRenderer.invoke(IPC.blobSave, { fileId, ext, bytes: new Uint8Array(bytes) }),
  deleteBlobs: (fileIds: string[]) => ipcRenderer.invoke(IPC.blobDelete, { fileIds }),
  downloadFile: (request: DownloadRequest) => ipcRenderer.invoke(IPC.fileDownload, request),
  exportWorkspace: () => ipcRenderer.invoke(IPC.exportRun),
  importFromFile: () => ipcRenderer.invoke(IPC.importFromFile),
  importFromText: (text: string) => ipcRenderer.invoke(IPC.importFromText, text),
  chooseDataDir: () => ipcRenderer.invoke(IPC.dataDirChoose),
  todoistFetch: (token: string) => ipcRenderer.invoke(IPC.todoistFetch, token),
  todoistPush: (token: string, items: import('@shared/domain/todoist').TodoistPushCandidate[]) =>
    ipcRenderer.invoke(IPC.todoistPush, { token, items }),
  runBackupNow: () => ipcRenderer.invoke(IPC.backupRun),
  chooseBackupDir: () => ipcRenderer.invoke(IPC.backupDirChoose),
  fakeToday: process.env.ARIADNE_FAKE_TODAY ?? null,
};

contextBridge.exposeInMainWorld('ariadne', api);
