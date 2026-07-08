import type { AriadneApi, WorkspaceSavePayload } from '@shared/ipc-contract';
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
  fakeToday: process.env.ARIADNE_FAKE_TODAY ?? null,
};

contextBridge.exposeInMainWorld('ariadne', api);
