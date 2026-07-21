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
  saveStatus: 'storage:saveStatus',
  todoistCompleted: 'todoist:completed',
  todoistPush: 'todoist:push',
  backupRun: 'backup:run',
  backupDirChoose: 'backupDir:choose',
  aiExtract: 'ai:extract',
  logEvent: 'log:event',
  logDirChoose: 'logDir:choose',
  logReveal: 'log:reveal',
  logInfo: 'log:info',
} as const;

/** Debug-log entry categories (D18); the main process drops anything else. */
export const DEBUG_LOG_CATEGORIES = [
  'app',
  'activity',
  'storage',
  'backup',
  'todoist',
  'import',
  'ai',
] as const;
export type DebugLogCategory = (typeof DEBUG_LOG_CATEGORIES)[number];

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

/**
 * Partial write-through: only collections that changed are present.
 * `replaceAll` marks the deliberate wipe-and-replace flows (clearAll, import)
 * so the storage write guard lets them empty populated collections.
 */
export type WorkspaceSavePayload = Partial<Pick<Workspace, CollectionName>> & {
  replaceAll?: boolean;
};

/** Collections the write guard refused to persist (renderer should surface). */
export interface WorkspaceSaveResponse {
  rejected: { name: CollectionName; reason: string }[];
}

/**
 * Pushed main → renderer when a debounced disk write fails (`ok: false`,
 * with the collection and error) and again once writes succeed after a
 * failure (`ok: true`) so the renderer can clear its warning.
 */
export interface SaveStatusEvent {
  ok: boolean;
  name?: CollectionName;
  message?: string;
}

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

export type TodoistPushResponse =
  | { ok: true; pushed: { taskId: string; todoistId: string }[]; failed: number }
  | { ok: false; error: string };

export type TodoistCompletedResponse =
  | { ok: true; items: import('./domain/todoist').TodoistCompletion[] }
  | { ok: false; error: string };

export interface AiExtractRequest {
  apiKey: string;
  text: string;
  /** Existing project names, so the model can suggest a mapping. */
  projectNames: string[];
}

export type AiExtractResponse =
  { ok: true; tasks: import('./domain/ai-import').ExtractedTask[] } | { ok: false; error: string };

export interface AriadneApi {
  loadWorkspace(): Promise<WorkspaceLoadResponse>;
  saveCollections(payload: WorkspaceSavePayload): Promise<WorkspaceSaveResponse>;
  /** Subscribe to disk-write health events (fires for the app's lifetime). */
  onSaveStatus(cb: (status: SaveStatusEvent) => void): void;
  getDataDir(): Promise<DataDirResponse>;
  openExternal(url: string): Promise<void>;
  saveBlob(fileId: string, ext: string, bytes: ArrayBuffer): Promise<{ size: number }>;
  deleteBlobs(fileIds: string[]): Promise<void>;
  downloadFile(request: DownloadRequest): Promise<DownloadResponse>;
  exportWorkspace(): Promise<ExportRunResponse>;
  importFromFile(): Promise<ImportResponse>;
  importFromText(text: string): Promise<ImportResponse>;
  chooseDataDir(): Promise<DataDirChooseResponse>;
  todoistCompleted(token: string, since: string, until: string): Promise<TodoistCompletedResponse>;
  todoistPush(
    token: string,
    items: import('./domain/todoist').TodoistPushCandidate[],
  ): Promise<TodoistPushResponse>;
  runBackupNow(): Promise<{ ok: boolean; path?: string; error?: string }>;
  chooseBackupDir(): Promise<{ path: string | null }>;
  aiExtract(request: AiExtractRequest): Promise<AiExtractResponse>;
  /** Fire-and-forget debug log line; a no-op unless debug logging is on (D18). */
  logEvent(category: DebugLogCategory, message: string): void;
  chooseLogDir(): Promise<{ path: string | null }>;
  /** Reveal the debug log file in the OS file manager. */
  revealLogFile(): Promise<{ ok: boolean; error?: string }>;
  /** Where the debug log goes when no custom folder is set. */
  getLogInfo(): Promise<{ defaultDir: string }>;
  /** E2E date pin (ARIADNE_FAKE_TODAY); null in normal runs. */
  fakeToday: string | null;
}
