import { contextBridge } from 'electron';

// Placeholder bridge. The typed IPC contract (shared/ipc-contract.ts) replaces
// this in Sprint 1; the renderer only ever sees `window.ariadne`.
const api = {
  ping: (): string => 'pong',
};

export type AriadneApi = typeof api;

contextBridge.exposeInMainWorld('ariadne', api);
