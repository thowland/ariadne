import type {
  ArchiveExportResponse,
  ArchiveImportResponse,
  AriadneApi,
  SaveStatusEvent,
} from '@shared/ipc-contract';
import { isOpenableExternally } from '@shared/ipc-contract';
import { WEB_COUNTS_HEADER, WEB_CSRF_HEADER, WEB_ROUTES, webBlobPath } from '@shared/web-contract';

/**
 * `window.ariadne` for the web build (D55): the same interface the desktop
 * preload exposes, answered by the Ariadne server over HTTP. Nothing above
 * this file knows which one it is talking to.
 *
 * A browser has no native dialogs, so the "pick a file" steps open the
 * browser's own picker and the "save as" steps become downloads. Desktop-only
 * features — the menu-bar quick add, the dock badge, native menus, choosing
 * folders on disk — answer as harmless no-ops.
 */

const CSRF = { [WEB_CSRF_HEADER]: '1' };

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...CSRF },
    body: JSON.stringify(body ?? null),
  });
  if (!res.ok) throw new Error(await errorOf(res));
  return (await res.json()) as T;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(await errorOf(res));
  return (await res.json()) as T;
}

async function errorOf(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === 'string') return body.error;
  } catch {
    // Not JSON; fall through to the status line.
  }
  return `Server error (${String(res.status)})`;
}

/**
 * Opens the browser's file picker. Resolves to null when the user cancels —
 * the `cancel` event, where the browser has it; a picker closed without it
 * simply leaves the promise pending, which is harmless.
 */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    const done = (file: File | null): void => {
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => {
      done(input.files?.[0] ?? null);
    });
    input.addEventListener('cancel', () => {
      done(null);
    });
    document.body.appendChild(input);
    input.click();
  });
}

/** Saves bytes the browser's way: a download named `name`. */
export function saveAs(data: Blob, name: string): void {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}

/** The file name a download response suggests, else `fallback`. */
function suggestedName(res: Response, fallback: string): string {
  const header = res.headers.get('content-disposition') ?? '';
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
  if (utf8 !== undefined) return decodeURIComponent(utf8);
  return /filename="([^"]+)"/i.exec(header)?.[1] ?? fallback;
}

const cancelled = { ok: false as const, error: 'Import cancelled', cancelled: true };

export function createWebApi(): AriadneApi {
  return {
    loadWorkspace: () => call(WEB_ROUTES.workspaceLoad),
    saveCollections: (payload) => call(WEB_ROUTES.workspaceSave, payload),

    onSaveStatus: (cb) => {
      if (!('EventSource' in window)) return;
      const events = new EventSource(WEB_ROUTES.events);
      events.addEventListener('save-status', (e) => {
        cb(JSON.parse((e as MessageEvent<string>).data) as SaveStatusEvent);
      });
    },

    getDataDir: () => getJson(WEB_ROUTES.dataDir),
    getAppInfo: () => getJson(WEB_ROUTES.appInfo),
    onMenuCommand: () => undefined,
    openExternal: (url) => {
      if (isOpenableExternally(url)) window.open(url, '_blank', 'noopener,noreferrer');
      return Promise.resolve();
    },

    saveBlob: async (fileId, ext, bytes) => {
      const res = await fetch(`${webBlobPath(fileId)}?ext=${encodeURIComponent(ext)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream', ...CSRF },
        body: bytes,
      });
      if (!res.ok) throw new Error(await errorOf(res));
      return (await res.json()) as { size: number };
    },
    deleteBlobs: (fileIds) => call(WEB_ROUTES.blobDelete, { fileIds }),

    downloadFile: async (request) => {
      if (request.content !== undefined) {
        saveAs(
          new Blob([request.content], { type: 'text/plain;charset=utf-8' }),
          request.suggestedName,
        );
        return { savedPath: request.suggestedName };
      }
      if (request.fileId === undefined) return { savedPath: null, error: 'Nothing to download' };
      const res = await fetch(webBlobPath(request.fileId));
      if (!res.ok) return { savedPath: null, error: 'No stored file to download' };
      saveAs(await res.blob(), request.suggestedName);
      return { savedPath: request.suggestedName };
    },

    /**
     * The browser's own print dialog stands in for Electron's print-to-PDF:
     * "Save as PDF" there gives the same document. No path comes back, so
     * the caller shows no "saved" toast for a save the user may not make.
     */
    exportReportPdf: (request) => {
      // A blob: URL made here is same-origin, so the new tab can be told to print.
      const url = URL.createObjectURL(new Blob([request.html], { type: 'text/html' }));
      const win = window.open(url, '_blank');
      if (win === null) {
        URL.revokeObjectURL(url);
        return Promise.resolve({ savedPath: null, error: 'Allow pop-ups to export a PDF' });
      }
      win.addEventListener('load', () => {
        win.focus();
        win.print();
        URL.revokeObjectURL(url);
      });
      return Promise.resolve({ savedPath: null });
    },

    exportWorkspace: async () => {
      const res = await fetch(WEB_ROUTES.exportJson);
      if (!res.ok) return { savedPath: null, error: await errorOf(res) };
      const name = suggestedName(res, 'ariadne-export.json');
      saveAs(await res.blob(), name);
      return { savedPath: name };
    },

    exportArchive: async () => {
      const res = await fetch(WEB_ROUTES.exportArchive);
      if (!res.ok) return { savedPath: null, error: await errorOf(res) };
      const name = suggestedName(res, 'ariadne-archive.zip');
      const countsHeader = res.headers.get(WEB_COUNTS_HEADER);
      saveAs(await res.blob(), name);
      return countsHeader === null
        ? { savedPath: name }
        : {
            savedPath: name,
            counts: JSON.parse(countsHeader) as ArchiveExportResponse['counts'],
          };
    },

    importArchive: async () => {
      const file = await pickFile('.zip,application/zip');
      if (file === null) return cancelled;
      const res = await fetch(WEB_ROUTES.importArchive, {
        method: 'POST',
        headers: { 'Content-Type': 'application/zip', ...CSRF },
        body: await file.arrayBuffer(),
      });
      if (!res.ok) return { ok: false, error: await errorOf(res) };
      return (await res.json()) as ArchiveImportResponse;
    },

    importFromFile: async () => {
      const file = await pickFile('.json,application/json');
      if (file === null) return cancelled;
      return call(WEB_ROUTES.importText, { text: await file.text() });
    },

    pickCsvFile: async () => {
      const file = await pickFile('.csv,.txt,text/csv,text/plain');
      if (file === null) return cancelled;
      try {
        return { ok: true, name: file.name, text: await file.text() };
      } catch {
        return { ok: false, error: 'Could not read that file' };
      }
    },

    importFromText: (text) => call(WEB_ROUTES.importText, { text }),

    // The data, backup and log folders live on the server; a browser cannot
    // choose them. Settings shows where they are; these leave them alone.
    chooseDataDir: async () => {
      const { path } = await getJson<{ path: string }>(WEB_ROUTES.dataDir);
      return { mode: 'unchanged', path, relaunching: false };
    },
    chooseBackupDir: () => Promise.resolve({ path: null }),
    chooseLogDir: () => Promise.resolve({ path: null }),
    revealLogFile: () =>
      Promise.resolve({ ok: false, error: 'The log file is on the server, in its logs folder' }),
    getLogInfo: () => getJson(WEB_ROUTES.logInfo),

    todoistCompleted: (token, since, until) =>
      call(WEB_ROUTES.todoistCompleted, { token, since, until }),
    todoistPush: (token, items) => call(WEB_ROUTES.todoistPush, { token, items }),
    runBackupNow: () => call(WEB_ROUTES.backupRun),
    aiExtract: (request) => call(WEB_ROUTES.aiExtract, request),

    logEvent: (category, message) => {
      void fetch(WEB_ROUTES.logEvent, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...CSRF },
        body: JSON.stringify({ category, message }),
      }).catch(() => undefined);
    },

    // Desktop-only (D28, D38, D51): no dock badge, the page follows the
    // theme through CSS, and there is no menu bar to put a quick add in.
    setBadge: () => Promise.resolve(),
    setNativeTheme: () => Promise.resolve(),
    configureQuickAdd: () => Promise.resolve(),
    onQuickAddCommit: () => undefined,
    getQuickAddContext: () => Promise.resolve({ context: null, lastProjectId: null }),
    onQuickAddContext: () => undefined,
    onQuickAddShown: () => undefined,
    submitQuickAdd: () => Promise.resolve({ ok: false, error: 'Not available in the web app' }),
    hideQuickAdd: () => undefined,

    fakeToday: null,
    insetTitlebar: false,
    blobBaseUrl: WEB_ROUTES.blob,
  };
}
