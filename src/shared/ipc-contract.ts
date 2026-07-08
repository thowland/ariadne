import type { CollectionName, Workspace } from './types';

/**
 * The typed IPC surface between renderer and main. Channel names are the
 * single source of truth for both ipcMain.handle registrations and the
 * preload bridge; payload types are shared by both sides.
 */

export const IPC = {
  workspaceLoad: 'workspace:load',
  workspaceSave: 'workspace:save',
  dataDirGet: 'dataDir:get',
  openExternal: 'shell:openExternal',
  blobSave: 'blob:save',
  blobDelete: 'blob:delete',
  fileDownload: 'file:download',
  exportRun: 'export:run',
  importFromFile: 'import:fromFile',
  importFromText: 'import:fromText',
  dataDirChoose: 'dataDir:choose',
} as const;

/** Scheme serving stored blob bytes to the renderer (img/object/fetch). */
export const BLOB_PROTOCOL = 'ariadne-blob';

export function blobUrl(fileId: string): string {
  return `${BLOB_PROTOCOL}://${fileId}`;
}

export interface WorkspaceLoadResponse {
  workspace: Workspace;
  warnings: string[];
  /** True when this launch created + seeded a brand-new data directory. */
  firstRun: boolean;
}

/** Partial write-through: only collections that changed are present. */
export type WorkspaceSavePayload = Partial<Pick<Workspace, CollectionName>>;

export interface DataDirResponse {
  path: string;
}

/**
 * The bridge surface exposed as `window.ariadne`. Implemented by the preload
 * script; consumed (type-only) by the renderer.
 */
export interface DownloadRequest {
  /** Blob-backed files download by id; markdown passes `content` instead. */
  fileId?: string;
  content?: string;
  suggestedName: string;
}

export interface DownloadResponse {
  savedPath: string | null;
  error?: string;
}

export interface ExportRunResponse {
  savedPath: string | null;
  error?: string;
}

export type ImportResponse =
  | { ok: true; workspace: Workspace; warnings: string[] }
  | { ok: false; error: string; cancelled?: boolean };

export interface DataDirChooseResponse {
  /** 'unchanged' also covers a cancelled dialog. */
  mode: 'loaded' | 'migrated' | 'unchanged';
  path: string;
  /** True when the app will relaunch to apply the change. */
  relaunching: boolean;
}

export interface AriadneApi {
  loadWorkspace(): Promise<WorkspaceLoadResponse>;
  saveCollections(payload: WorkspaceSavePayload): Promise<void>;
  getDataDir(): Promise<DataDirResponse>;
  openExternal(url: string): Promise<void>;
  saveBlob(fileId: string, ext: string, bytes: ArrayBuffer): Promise<{ size: number }>;
  deleteBlobs(fileIds: string[]): Promise<void>;
  downloadFile(request: DownloadRequest): Promise<DownloadResponse>;
  exportWorkspace(): Promise<ExportRunResponse>;
  importFromFile(): Promise<ImportResponse>;
  importFromText(text: string): Promise<ImportResponse>;
  chooseDataDir(): Promise<DataDirChooseResponse>;
  /** E2E date pin (ARIADNE_FAKE_TODAY); null in normal runs. */
  fakeToday: string | null;
}
