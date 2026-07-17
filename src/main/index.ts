import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { BLOB_PROTOCOL } from '@shared/ipc-contract';
import { app, BrowserWindow, net, protocol, shell } from 'electron';

import { registerIpc } from './ipc';
import { BackupService } from './services/backup-service';
import { BlobService } from './services/blob-service';
import { ConfigService } from './services/config-service';
import { LoggerService } from './services/logger-service';
import { StorageService } from './services/storage-service';

// E2E runs isolate Electron's per-user state (and with it the default data
// directory) into a throwaway folder.
const testUserData = process.env.ARIADNE_TEST_USER_DATA;
if (testUserData) {
  app.setPath('userData', testUserData);
}

let storage: StorageService | null = null;
let backups: BackupService | null = null;
let logger: LoggerService | null = null;
let quitting = false;
let mainWindow: BrowserWindow | null = null;

// Single-user desktop app: a second launch focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}
app.on('second-instance', () => {
  if (mainWindow !== null) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// Must run before app ready. corsEnabled lets renderer fetch() reach the
// scheme at all (Chromium ≥ Electron 39 blocks cross-origin fetches to
// schemes outside its CORS-enabled list); the handler must then answer
// with Access-Control-Allow-Origin.
protocol.registerSchemesAsPrivileged([
  { scheme: BLOB_PROTOCOL, privileges: { stream: true, supportFetchAPI: true, corsEnabled: true } },
]);

function createWindow(config: ConfigService): void {
  const bounds = config.load().windowBounds;
  const win = new BrowserWindow({
    width: bounds?.width ?? 1440,
    height: bounds?.height ?? 900,
    x: bounds?.x,
    y: bounds?.y,
    show: false,
    autoHideMenuBar: true,
    title: 'Ariadne',
    backgroundColor: '#f6f6f4',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow = win;
  win.on('ready-to-show', () => {
    win.show();
  });

  win.on('close', () => {
    config.save({ ...config.load(), windowBounds: win.getBounds() });
  });
  win.on('closed', () => {
    mainWindow = null;
  });

  // The renderer never opens windows; external links go through the OS browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

process.on('uncaughtException', (err) => {
  logger?.error(`uncaughtException: ${err.stack ?? err.message}`);
});

void app.whenReady().then(() => {
  const config = new ConfigService(app.getPath('userData'));
  logger = new LoggerService(app.getPath('userData'));
  logger.info(`Ariadne starting (v${app.getVersion()})`);
  const dataDir = config.resolveDataDir();
  backups = new BackupService(dataDir);
  const blobs = new BlobService(dataDir);
  storage = new StorageService(dataDir, backups);
  storage.init();
  registerIpc(storage, backups, blobs, config, dataDir);

  // Daily backup: at startup (before any edits this session) and re-checked
  // hourly so a machine that never restarts still gets one per day.
  backups.runIfNeededToday();
  const backupTimer = setInterval(
    () => {
      backups?.runIfNeededToday();
    },
    60 * 60 * 1000,
  );
  backupTimer.unref();

  // Serve stored blobs to the renderer (img/object/fetch) without IPC copies.
  protocol.handle(BLOB_PROTOCOL, async (request) => {
    const cors = { 'Access-Control-Allow-Origin': '*' };
    const fileId = new URL(request.url).host;
    const path = blobs.find(fileId);
    if (path === null) return new Response('Not found', { status: 404, headers: cors });
    const res = await net.fetch(pathToFileURL(path).toString());
    const headers = new Headers(res.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    return new Response(res.body, { status: res.status, headers });
  });

  createWindow(config);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(config);
  });
});

// On quit: flush any debounced saves, then refresh today's backup so the
// on-disk backup always reflects the state the user quit with.
app.on('before-quit', (event) => {
  if (quitting) return;
  quitting = true;
  event.preventDefault();
  const s = storage;
  const b = backups;
  void (async () => {
    try {
      if (s !== null) await s.flushAll();
      const result = b?.runBackup();
      if (result !== undefined && !result.ok)
        logger?.error(`quit backup failed: ${result.error ?? ''}`);
    } catch (err) {
      logger?.error(`quit flush failed: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      app.quit();
    }
  })();
});

app.on('window-all-closed', () => {
  app.quit();
});
