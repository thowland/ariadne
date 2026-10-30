/**
 * The web build's HTTP surface (D55): the browser talks to `src/server` over
 * these routes instead of to Electron over IPC. Shared so the client and the
 * server cannot drift apart, the way `IPC` keeps preload and main in step.
 *
 * JSON routes take and return JSON. The rest move raw bytes: blob uploads,
 * blob reads, export downloads and the archive upload.
 */
export const WEB_ROUTES = {
  workspaceLoad: '/api/workspace/load',
  workspaceSave: '/api/workspace/save',
  /** Server-sent events: one `save-status` event per failed or recovered write. */
  events: '/api/events',
  appInfo: '/api/app-info',
  dataDir: '/api/data-dir',
  logEvent: '/api/log',
  logInfo: '/api/log/info',
  /** `PUT /api/blob/<fileId>?ext=pdf` stores bytes; `GET` reads them back. */
  blob: '/api/blob/',
  blobDelete: '/api/blob-delete',
  exportJson: '/api/export/json',
  exportArchive: '/api/export/archive',
  importArchive: '/api/import/archive',
  importText: '/api/import/text',
  backupRun: '/api/backup/run',
  todoistCompleted: '/api/todoist/completed',
  todoistPush: '/api/todoist/push',
  aiExtract: '/api/ai/extract',
} as const;

/**
 * Every state-changing request carries this header. A page on another origin
 * cannot add a custom header without a CORS preflight the server never
 * grants, so the header is what stops a hostile site from POSTing to a server
 * listening on localhost.
 */
export const WEB_CSRF_HEADER = 'x-ariadne';

/** Response header carrying an archive export's counts as JSON. */
export const WEB_COUNTS_HEADER = 'x-ariadne-counts';

export function webBlobPath(fileId: string): string {
  return `${WEB_ROUTES.blob}${encodeURIComponent(fileId)}`;
}
