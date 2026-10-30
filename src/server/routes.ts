import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { todayIso } from '@shared/domain/clock';
import { seedWorkspace } from '@shared/domain/seed';
import type { TodoistPushCandidate } from '@shared/domain/todoist';
import { DEBUG_LOG_CATEGORIES } from '@shared/ipc-contract';
import type { AppInfo, SaveStatusEvent, WorkspaceLoadResponse } from '@shared/ipc-contract';
import { WEB_COUNTS_HEADER, WEB_CSRF_HEADER, WEB_ROUTES } from '@shared/web-contract';

import { AiExtractService } from '../main/services/ai-extract-service';
import { ArchiveService } from '../main/services/archive-service';
import type { BackupService } from '../main/services/backup-service';
import type { BlobService } from '../main/services/blob-service';
import type { DebugLogService } from '../main/services/debug-log-service';
import { ImportExportService } from '../main/services/import-export-service';
import type { StorageService } from '../main/services/storage-service';
import { TodoistPushService, TodoistService } from '../main/services/todoist-service';

import {
  attachment,
  contentTypeFor,
  HttpError,
  readBody,
  readJson,
  sendBytes,
  sendJson,
} from './http';

/**
 * The web build's API (D55): the same services the desktop app's `ipc.ts`
 * routes to, reached over HTTP. Like `ipc.ts` it holds no domain logic;
 * unlike it, nothing here can open a dialog, so every "pick a file" and
 * "choose where to save" step happens in the browser and arrives here as
 * bytes, or leaves as a download.
 */

export interface ApiDeps {
  storage: StorageService;
  backups: BackupService;
  blobs: BlobService;
  debugLog: DebugLogService;
  dataDir: string;
  version: string;
  /** E2E/demo date pin, as the desktop app's ARIADNE_FAKE_TODAY. */
  fakeToday?: string;
  /** Uploads (blobs, archives) larger than this are refused. */
  maxUploadBytes?: number;
}

export type ApiHandler = (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;

const JSON_LIMIT = 50 * 1024 * 1024;
const DEFAULT_UPLOAD_LIMIT = 500 * 1024 * 1024;

function rec(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export function createApi(deps: ApiDeps): {
  handle: ApiHandler;
  /** Pushes a save status to every open browser tab (the SSE stream). */
  broadcastSaveStatus: (status: SaveStatusEvent) => void;
} {
  const { storage, backups, blobs, debugLog, dataDir } = deps;
  const uploadLimit = deps.maxUploadBytes ?? DEFAULT_UPLOAD_LIMIT;
  const importExport = new ImportExportService(storage, blobs);
  const archives = new ArchiveService(storage, blobs, deps.version);
  const todoist = new TodoistService();
  const todoistPush = new TodoistPushService(todoist);
  const aiExtract = new AiExtractService();
  const today = (): string => todayIso(deps.fakeToday);
  const listeners = new Set<ServerResponse>();

  /** Writes to a temp file, hands its path to `use`, and always cleans up. */
  const withTempFile = async <T>(ext: string, use: (path: string) => Promise<T>): Promise<T> => {
    const path = join(tmpdir(), `ariadne-${randomUUID()}.${ext}`);
    try {
      return await use(path);
    } finally {
      await rm(path, { force: true });
    }
  };

  type Route = (req: IncomingMessage, res: ServerResponse, url: URL) => Promise<void> | void;
  const post: Record<string, Route> = {
    [WEB_ROUTES.workspaceLoad]: async (_req, res) => {
      const loaded = await storage.loadWorkspace();
      if (loaded.workspace !== null) {
        const body: WorkspaceLoadResponse = {
          workspace: loaded.workspace,
          warnings: loaded.warnings,
          firstRun: false,
        };
        sendJson(res, 200, body);
        return;
      }
      // First run: seed the sample dataset, as the desktop app does.
      const seeded = seedWorkspace(today());
      await storage.saveWorkspaceNow(seeded);
      sendJson(res, 200, { workspace: seeded, warnings: loaded.warnings, firstRun: true });
    },

    [WEB_ROUTES.workspaceSave]: async (req, res) => {
      const payload = rec(await readJson(req, JSON_LIMIT));
      // An untrusted boundary, exactly as over IPC: the write guard screens
      // every collection before it can reach disk.
      const rejected = storage.savePayload(payload);
      if (rejected.length > 0) {
        debugLog.log(
          'storage',
          `write guard rejected: ${rejected.map((r) => `${r.name} (${r.reason})`).join('; ')}`,
        );
      }
      if (payload.settings !== undefined && !rejected.some((r) => r.name === 'settings')) {
        debugLog.configure(payload.settings);
      }
      sendJson(res, 200, { rejected });
    },

    [WEB_ROUTES.logEvent]: async (req, res) => {
      const body = rec(await readJson(req, 64 * 1024));
      const known = DEBUG_LOG_CATEGORIES.find((c) => c === body.category);
      if (known !== undefined && typeof body.message === 'string') {
        debugLog.log(known, body.message);
      }
      sendJson(res, 200, null);
    },

    [WEB_ROUTES.blobDelete]: async (req, res) => {
      const ids = rec(await readJson(req, JSON_LIMIT)).fileIds;
      await blobs.deleteMany(
        Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [],
      );
      sendJson(res, 200, null);
    },

    [WEB_ROUTES.importText]: async (req, res) => {
      const text = str(rec(await readJson(req, uploadLimit)).text);
      const result = await importExport.importFromText(text);
      debugLog.log(
        'import',
        result.ok
          ? `import from JSON: ${String(result.workspace.projects.length)} project(s), ${String(result.workspace.tasks.length)} task(s)`
          : `import from JSON FAILED: ${result.error}`,
      );
      sendJson(res, 200, result);
    },

    [WEB_ROUTES.importArchive]: async (req, res) => {
      const bytes = await readBody(req, uploadLimit);
      const result = await withTempFile('zip', async (path) => {
        await writeFile(path, bytes);
        return archives.importFrom(path);
      });
      debugLog.log(
        'import',
        result.ok
          ? `archive import: ${String(result.workspace.projects.length)} project(s), ${String(result.blobs)} file(s)`
          : `archive import FAILED: ${result.error}`,
      );
      sendJson(res, 200, result);
    },

    [WEB_ROUTES.backupRun]: async (_req, res) => {
      debugLog.log('backup', 'manual backup requested');
      await storage.flushAll();
      sendJson(res, 200, backups.runBackup());
    },

    [WEB_ROUTES.todoistCompleted]: async (req, res) => {
      const body = rec(await readJson(req, JSON_LIMIT));
      const result = await todoist.fetchCompleted(
        str(body.token),
        str(body.since),
        str(body.until),
      );
      debugLog.log(
        'todoist',
        result.ok
          ? `completion sync: ${String(result.items.length)} completed item(s) fetched`
          : `completion sync FAILED: ${result.error}`,
      );
      sendJson(res, 200, result);
    },

    [WEB_ROUTES.todoistPush]: async (req, res) => {
      const body = rec(await readJson(req, JSON_LIMIT));
      const items = Array.isArray(body.items) ? (body.items as TodoistPushCandidate[]) : [];
      const result = await todoistPush.pushTasks(str(body.token), items);
      debugLog.log(
        'todoist',
        result.ok
          ? `push: ${String(result.pushed.length)} pushed, ${String(result.failed)} failed`
          : `push FAILED: ${result.error}`,
      );
      sendJson(res, 200, result);
    },

    [WEB_ROUTES.aiExtract]: async (req, res) => {
      const body = rec(await readJson(req, JSON_LIMIT));
      const names = Array.isArray(body.projectNames)
        ? body.projectNames.filter((n): n is string => typeof n === 'string')
        : [];
      const result = await aiExtract.extractTasks(str(body.apiKey), str(body.text), names, today());
      debugLog.log(
        'ai',
        result.ok
          ? `extract complete: ${String(result.tasks.length)} task(s)`
          : `extract FAILED: ${result.error}`,
      );
      sendJson(res, 200, result);
    },
  };

  const get: Record<string, Route> = {
    [WEB_ROUTES.appInfo]: (_req, res) => {
      const info: AppInfo = {
        version: deps.version,
        electron: 'web',
        chrome: 'web',
        node: process.versions.node,
        platform: process.platform,
        dataDir,
      };
      sendJson(res, 200, info);
    },
    [WEB_ROUTES.dataDir]: (_req, res) => {
      sendJson(res, 200, { path: dataDir });
    },
    [WEB_ROUTES.logInfo]: (_req, res) => {
      sendJson(res, 200, { defaultDir: debugLog.defaultLogDir() });
    },

    [WEB_ROUTES.exportJson]: async (_req, res) => {
      const result = await withTempFile('json', async (path) => {
        const out = await importExport.exportTo(path);
        return out.ok ? { ok: true as const, bytes: await readFile(path) } : out;
      });
      if (!('bytes' in result)) {
        sendJson(res, 409, { error: result.error ?? 'Export failed' });
        return;
      }
      debugLog.log('import', 'export complete (download)');
      sendBytes(res, result.bytes, 'application/json; charset=utf-8', {
        'Content-Disposition': attachment(`ariadne-export-${today()}.json`),
      });
    },

    [WEB_ROUTES.exportArchive]: async (_req, res) => {
      const result = await withTempFile('zip', async (path) => {
        const out = await archives.exportTo(path);
        return out.ok ? { ...out, data: await readFile(path) } : out;
      });
      if (!result.ok) {
        sendJson(res, 409, { error: result.error });
        return;
      }
      debugLog.log('import', `archive export: ${String(result.counts.blobs)} file(s)`);
      sendBytes(res, result.data, 'application/zip', {
        'Content-Disposition': attachment(`ariadne-archive-${today()}.zip`),
        [WEB_COUNTS_HEADER]: JSON.stringify(result.counts),
      });
    },

    [WEB_ROUTES.events]: (req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
      });
      res.write(': connected\n\n');
      listeners.add(res);
      req.on('close', () => {
        listeners.delete(res);
      });
    },
  };

  const blobRoute = async (req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> => {
    const fileId = decodeURIComponent(url.pathname.slice(WEB_ROUTES.blob.length));
    if (!/^[\w-]+$/.test(fileId)) throw new HttpError(400, 'Bad file id');
    if (req.method === 'PUT') {
      if (req.headers[WEB_CSRF_HEADER] !== '1') throw new HttpError(403, 'Forbidden');
      const ext = (url.searchParams.get('ext') ?? '').toLowerCase();
      const bytes = await readBody(req, uploadLimit);
      sendJson(res, 200, await blobs.save(fileId, ext, new Uint8Array(bytes)));
      return;
    }
    if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed');
    const path = blobs.find(fileId);
    if (path === null) throw new HttpError(404, 'Not found');
    const download = url.searchParams.get('download');
    sendBytes(res, await readFile(path), contentTypeFor(path), {
      // Stored files are the user's own uploads, but an HTML or SVG upload
      // must never run as a page on this origin.
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      'X-Content-Type-Options': 'nosniff',
      ...(download !== null ? { 'Content-Disposition': attachment(download) } : {}),
    });
  };

  const handle: ApiHandler = async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return false;
    try {
      if (url.pathname.startsWith(WEB_ROUTES.blob)) {
        await blobRoute(req, res, url);
        return true;
      }
      const table = req.method === 'POST' ? post : req.method === 'GET' ? get : undefined;
      const route = table?.[url.pathname];
      if (route === undefined) throw new HttpError(404, 'Not found');
      if (req.method === 'POST' && req.headers[WEB_CSRF_HEADER] !== '1') {
        throw new HttpError(403, 'Forbidden');
      }
      await route(req, res, url);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      const message = err instanceof Error ? err.message : 'Server error';
      if (status === 500) debugLog.log('app', `web API ${url.pathname} failed: ${message}`);
      if (!res.headersSent) sendJson(res, status, { error: message });
      else res.end();
    }
    return true;
  };

  const broadcastSaveStatus = (status: SaveStatusEvent): void => {
    const frame = `event: save-status\ndata: ${JSON.stringify(status)}\n\n`;
    for (const res of listeners) res.write(frame);
  };

  return { handle, broadcastSaveStatus };
}
