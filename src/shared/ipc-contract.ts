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
  appInfo: 'app:info',
  openExternal: 'shell:openExternal',
  blobSave: 'blob:save',
  blobDelete: 'blob:delete',
  fileDownload: 'file:download',
  reportExportPdf: 'report:exportPdf',
  exportRun: 'export:run',
  archiveExport: 'archive:export',
  archiveImport: 'archive:import',
  menuCommand: 'app:menuCommand',
  importFromFile: 'import:fromFile',
  csvPick: 'csv:pick',
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
  badgeSet: 'badge:set',
  nativeTheme: 'theme:set',
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

/**
 * Menu items that act on workspace data are routed to the renderer, which
 * already implements those flows; the main process only owns window roles
 * and external links. Keep in sync with `main/menu.ts` and the renderer's
 * menu-command handler.
 */
export const MENU_COMMANDS = [
  'about',
  'help',
  'shortcuts',
  'newProject',
  'newTask',
  'aiImport',
  'exportArchive',
  'importArchive',
  'exportJson',
  'importJson',
  'backupNow',
  'todoistSync',
  'search',
  'goHome',
  'goCalendar',
  'goReports',
  'goContacts',
  'goFiles',
  'goTags',
  'goSettings',
  'scopeAll',
  'scopeWork',
  'scopeHome',
] as const;
export type MenuCommand = (typeof MENU_COMMANDS)[number];

/** Outbound links shown in the menu, About box, and Help window. */
export const EXTERNAL_LINKS = {
  github: 'https://github.com/thowland/ariadne',
  issues: 'https://github.com/thowland/ariadne/issues',
  author: 'https://timhowland.com',
} as const;

/**
 * Schemes the app will hand to the OS. An explicit allowlist, never a
 * passthrough: `shell.openExternal` will happily launch `file:` or any
 * registered custom scheme, and the renderer's URLs come from user data.
 * `mailto:` and `tel:` are here so a contact's email and phone can be acted
 * on (D32).
 */
export const OPENABLE_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:'] as const;

/** True when `url` is one of the handful of things we will open externally. */
export function isOpenableExternally(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  // Parsed rather than prefix-matched: "https:/\evil" and whitespace tricks
  // do not survive the URL parser, and a scheme match is then exact.
  try {
    const scheme = new URL(url).protocol;
    return (OPENABLE_SCHEMES as readonly string[]).includes(scheme);
  } catch {
    return false;
  }
}

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

/**
 * A text file the user picked (D33). Main owns the dialog and the disk; the
 * parsing stays in `shared/domain`, so the importer is testable without a
 * filesystem and a second importer can reuse this channel unchanged.
 */
export type CsvPickResponse =
  { ok: true; name: string; text: string } | { ok: false; error: string; cancelled?: boolean };

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

/** Print-to-PDF of a rendered report (D26). */
export interface ReportPdfRequest {
  /** A complete standalone HTML document — see shared/domain/report-print.ts. */
  html: string;
  suggestedName: string;
}

export interface ReportPdfResponse {
  savedPath: string | null;
  error?: string;
}

export interface ExportRunResponse {
  savedPath: string | null;
  error?: string;
}

/** Zip archive export (D22): workspace JSON + every stored file. */
export interface ArchiveExportResponse {
  savedPath: string | null;
  error?: string;
  counts?: { projects: number; tasks: number; files: number; contacts: number; blobs: number };
}

export type ArchiveImportResponse =
  | { ok: true; workspace: Workspace; warnings: string[]; blobs: number }
  | { ok: false; error: string; cancelled?: boolean };

/** App metadata for the About box; sourced from the main process. */
export interface AppInfo {
  version: string;
  electron: string;
  chrome: string;
  node: string;
  platform: string;
  dataDir: string;
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
  /** Version/runtime facts for the About box. */
  getAppInfo(): Promise<AppInfo>;
  /** Subscribe to application-menu commands (fires for the app's lifetime). */
  onMenuCommand(cb: (command: MenuCommand) => void): void;
  openExternal(url: string): Promise<void>;
  saveBlob(fileId: string, ext: string, bytes: ArrayBuffer): Promise<{ size: number }>;
  deleteBlobs(fileIds: string[]): Promise<void>;
  downloadFile(request: DownloadRequest): Promise<DownloadResponse>;
  /** Save-dialog + Chromium print-to-PDF of a rendered report (D26). */
  exportReportPdf(request: ReportPdfRequest): Promise<ReportPdfResponse>;
  exportWorkspace(): Promise<ExportRunResponse>;
  /** Save-dialog + zip archive of the workspace and every stored file (D22). */
  exportArchive(): Promise<ArchiveExportResponse>;
  /** Open-dialog + restore from a zip archive; replaces the workspace (D22). */
  importArchive(): Promise<ArchiveImportResponse>;
  importFromFile(): Promise<ImportResponse>;
  /** Open-dialog + read a .csv as text; nothing is parsed in the main process. */
  pickCsvFile(): Promise<CsvPickResponse>;
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
  /**
   * Sets the dock/taskbar badge to `count` (0 clears it). A no-op on
   * platforms without one — Windows needs an overlay icon instead.
   */
  setBadge(count: number): Promise<void>;
  /**
   * Tells Electron which theme to paint its own chrome with (D38) — native
   * dialogs, menus and the macOS traffic lights, none of which read the
   * renderer's CSS.
   */
  setNativeTheme(choice: import('./types').ThemeChoice): Promise<void>;
  /** E2E date pin (ARIADNE_FAKE_TODAY); null in normal runs. */
  fakeToday: string | null;
  /**
   * True when the window uses the macOS hidden-inset titlebar, so the top bar
   * leaves room for the traffic lights and offers a drag region.
   */
  insetTitlebar: boolean;
}
