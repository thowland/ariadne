import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { WorkspaceLoadResponse } from '@shared/ipc-contract';
import { WEB_COUNTS_HEADER, WEB_CSRF_HEADER, WEB_ROUTES, webBlobPath } from '@shared/web-contract';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BackupService } from '../main/services/backup-service';
import { BlobService } from '../main/services/blob-service';
import { DebugLogService } from '../main/services/debug-log-service';
import { StorageService } from '../main/services/storage-service';

import { createApi } from './routes';

const TODAY = '2026-07-08';
let dir: string;
let server: Server;
let base: string;
let storage: StorageService;
let api: ReturnType<typeof createApi>;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ariadne-web-api-'));
  const backups = new BackupService(dir, () => TODAY);
  storage = new StorageService(dir, backups, 0);
  storage.init();
  api = createApi({
    storage,
    backups,
    blobs: new BlobService(dir),
    debugLog: new DebugLogService(join(dir, 'logs')),
    dataDir: dir,
    version: '9.9.9',
    fakeToday: TODAY,
    maxUploadBytes: 256 * 1024,
  });
  server = createServer((req, res) => {
    void api.handle(req, res).then((handled) => {
      if (!handled) res.writeHead(418).end();
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
});

afterEach(async () => {
  await storage.flushAll();
  server.closeAllConnections();
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
  rmSync(dir, { recursive: true, force: true });
});

const post = (path: string, body: unknown, csrf = true): Promise<Response> =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(csrf ? { [WEB_CSRF_HEADER]: '1' } : {}) },
    body: JSON.stringify(body),
  });

async function load(): Promise<WorkspaceLoadResponse> {
  return (await (await post(WEB_ROUTES.workspaceLoad, null)).json()) as WorkspaceLoadResponse;
}

describe('web API (D55)', () => {
  it('seeds a first run, then saves and loads the workspace', async () => {
    const first = await load();
    expect(first.firstRun).toBe(true);
    expect(first.workspace.projects.length).toBeGreaterThan(0);

    const projects = first.workspace.projects.map((p, i) =>
      i === 0 ? { ...p, name: 'Renamed' } : p,
    );
    const saved = await post(WEB_ROUTES.workspaceSave, { projects });
    expect(await saved.json()).toEqual({ rejected: [] });
    await storage.flushAll();

    const again = await load();
    expect(again.firstRun).toBe(false);
    expect(again.workspace.projects[0]?.name).toBe('Renamed');
  });

  it('refuses state changes without the CSRF header', async () => {
    const res = await post(WEB_ROUTES.workspaceLoad, null, false);
    expect(res.status).toBe(403);
    const put = await fetch(`${base}${webBlobPath('f1')}?ext=txt`, { method: 'PUT', body: 'x' });
    expect(put.status).toBe(403);
  });

  it('stores, serves, downloads and deletes a file', async () => {
    const put = await fetch(`${base}${webBlobPath('f1')}?ext=txt`, {
      method: 'PUT',
      headers: { [WEB_CSRF_HEADER]: '1' },
      body: 'hello',
    });
    expect(await put.json()).toEqual({ size: 5 });

    const got = await fetch(`${base}${webBlobPath('f1')}?download=Notes.txt`);
    expect(await got.text()).toBe('hello');
    expect(got.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(got.headers.get('content-disposition')).toContain('Notes.txt');
    expect(got.headers.get('content-security-policy')).toContain("default-src 'none'");

    await post(WEB_ROUTES.blobDelete, { fileIds: ['f1'] });
    expect((await fetch(`${base}${webBlobPath('f1')}`)).status).toBe(404);
  });

  it('refuses bad file ids, oversized uploads and unknown routes', async () => {
    expect((await fetch(`${base}${webBlobPath('../x')}`)).status).toBe(400);
    const big = await fetch(`${base}${webBlobPath('f2')}?ext=bin`, {
      method: 'PUT',
      headers: { [WEB_CSRF_HEADER]: '1' },
      body: 'x'.repeat(300 * 1024),
    });
    expect(big.status).toBe(413);
    expect((await post('/api/nope', null)).status).toBe(404);
    expect((await fetch(`${base}${webBlobPath('f1')}`, { method: 'DELETE' })).status).toBe(405);
    expect((await fetch(`${base}/not-api`)).status).toBe(418);
  });

  it('exports JSON and an archive as downloads, and imports JSON back', async () => {
    await load();
    const json = await fetch(`${base}${WEB_ROUTES.exportJson}`);
    expect(json.headers.get('content-disposition')).toContain(`ariadne-export-${TODAY}.json`);
    const text = await json.text();
    expect(JSON.parse(text)).toHaveProperty('projects');

    const zip = await fetch(`${base}${WEB_ROUTES.exportArchive}`);
    expect(zip.headers.get('content-type')).toBe('application/zip');
    expect(JSON.parse(zip.headers.get(WEB_COUNTS_HEADER) ?? '{}')).toHaveProperty('projects');

    const imported = (await (await post(WEB_ROUTES.importText, { text })).json()) as {
      ok: boolean;
    };
    expect(imported.ok).toBe(true);
  });

  it('says why an export cannot run before there is a workspace', async () => {
    const res = await fetch(`${base}${WEB_ROUTES.exportJson}`);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Nothing to export yet' });
  });

  it('reports app info and folders', async () => {
    const info = (await (await fetch(`${base}${WEB_ROUTES.appInfo}`)).json()) as {
      version: string;
      dataDir: string;
    };
    expect(info).toMatchObject({ version: '9.9.9', dataDir: dir });
    expect(await (await fetch(`${base}${WEB_ROUTES.dataDir}`)).json()).toEqual({ path: dir });
  });

  it('streams save-status events to open tabs', async () => {
    const res = await fetch(`${base}${WEB_ROUTES.events}`);
    const reader = res.body!.getReader();
    await reader.read(); // ": connected"
    api.broadcastSaveStatus({ ok: false, name: 'tasks', message: 'disk full' });
    const { value } = (await reader.read()) as { value?: Uint8Array };
    expect(new TextDecoder().decode(value)).toContain('event: save-status');
    await reader.cancel();
  });

  it('accepts log lines and ignores unknown categories', async () => {
    expect((await post(WEB_ROUTES.logEvent, { category: 'app', message: 'hi' })).status).toBe(200);
    expect((await post(WEB_ROUTES.logEvent, { category: 'nope', message: 1 })).status).toBe(200);
  });

  it('restores an exported archive, and explains one it cannot read', async () => {
    await load();
    const zip = await (await fetch(`${base}${WEB_ROUTES.exportArchive}`)).arrayBuffer();
    const restore = await fetch(`${base}${WEB_ROUTES.importArchive}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/zip', [WEB_CSRF_HEADER]: '1' },
      body: zip,
    });
    const restored = (await restore.json()) as { ok: boolean; workspace?: { projects: unknown[] } };
    expect(restored.ok).toBe(true);
    expect(restored.workspace?.projects.length).toBeGreaterThan(0);

    const bad = await fetch(`${base}${WEB_ROUTES.importArchive}`, {
      method: 'POST',
      headers: { [WEB_CSRF_HEADER]: '1' },
      body: 'not a zip',
    });
    expect(await bad.json()).toEqual({
      ok: false,
      error: 'Could not read the archive — is it a valid .zip?',
    });
  });

  it('keeps the write guard: an empty list cannot overwrite saved projects', async () => {
    await load();
    const res = (await (await post(WEB_ROUTES.workspaceSave, { projects: [] })).json()) as {
      rejected: { name: string; reason: string }[];
    };
    expect(res.rejected).toHaveLength(1);
    expect(res.rejected[0]?.name).toBe('projects');
    expect(res.rejected[0]?.reason).toContain('empty list');
  });

  it('runs a backup on request', async () => {
    await load();
    const res = (await (await post(WEB_ROUTES.backupRun, null)).json()) as { ok: boolean };
    expect(res.ok).toBe(true);
  });

  it('passes Todoist and Claude requests to their services', async () => {
    // Without a token or key the services answer at once, with no network call.
    expect(await (await post(WEB_ROUTES.todoistCompleted, { token: '' })).json()).toEqual({
      ok: false,
      error: 'Add your Todoist API token first',
    });
    expect(await (await post(WEB_ROUTES.todoistPush, { token: '', items: [] })).json()).toEqual({
      ok: false,
      error: 'Add your Todoist API token first',
    });
    expect(await (await post(WEB_ROUTES.aiExtract, { apiKey: '', text: 'x' })).json()).toEqual({
      ok: false,
      error: 'Add your Anthropic API key in Settings first',
    });
  });

  it('reports the log folder', async () => {
    expect(await (await fetch(`${base}${WEB_ROUTES.logInfo}`)).json()).toEqual({
      defaultDir: join(dir, 'logs'),
    });
  });

  it('answers 500 with the message when a service throws', async () => {
    const broken = createApi({
      storage: {
        loadWorkspace: () => Promise.reject(new Error('disk on fire')),
      } as unknown as StorageService,
      backups: new BackupService(dir, () => TODAY),
      blobs: new BlobService(dir),
      debugLog: new DebugLogService(join(dir, 'logs')),
      dataDir: dir,
      version: '0',
    });
    const other = createServer((req, res) => {
      void broken.handle(req, res);
    });
    await new Promise<void>((resolve) => {
      other.listen(0, '127.0.0.1', resolve);
    });
    const port = (other.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${String(port)}${WEB_ROUTES.workspaceLoad}`, {
      method: 'POST',
      headers: { [WEB_CSRF_HEADER]: '1' },
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'disk on fire' });
    other.closeAllConnections();
    await new Promise<void>((resolve) => {
      other.close(() => {
        resolve();
      });
    });
  });
});
