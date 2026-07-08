import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { BLOB_PROTOCOL } from '@shared/ipc-contract';
import { app, BrowserWindow, net, protocol, shell } from 'electron';

import { registerIpc } from './ipc';
import { BackupService } from './services/backup-service';
import { BlobService } from './services/blob-service';
import { ConfigService } from './services/config-service';
import { StorageService } from './services/storage-service';

// E2E runs isolate Electron's per-user state (and with it the default data
// directory) into a throwaway folder.
const testUserData = process.env.ARIADNE_TEST_USER_DATA;
if (testUserData) {
  app.setPath('userData', testUserData);
}

let storage: StorageService | null = null;

// Must run before app ready.
protocol.registerSchemesAsPrivileged([
  { scheme: BLOB_PROTOCOL, privileges: { stream: true, supportFetchAPI: true } },
]);

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
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

  win.on('ready-to-show', () => {
    win.show();
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

void app.whenReady().then(() => {
  const config = new ConfigService(app.getPath('userData'));
  const dataDir = config.resolveDataDir();
  const backups = new BackupService(dataDir);
  const blobs = new BlobService(dataDir);
  storage = new StorageService(dataDir, backups);
  storage.init();
  registerIpc(storage, blobs, dataDir);

  // Serve stored blobs to the renderer (img/object/fetch) without IPC copies.
  protocol.handle(BLOB_PROTOCOL, (request) => {
    const fileId = new URL(request.url).host;
    const path = blobs.find(fileId);
    if (path === null) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(path).toString());
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Auto-save is debounced in StorageService; make sure nothing pending is
// lost when the app quits.
app.on('before-quit', (event) => {
  if (storage !== null && storage.pendingCount() > 0) {
    event.preventDefault();
    const s = storage;
    storage = null; // don't loop through this handler again
    void s.flushAll().finally(() => {
      app.quit();
    });
  }
});

app.on('window-all-closed', () => {
  app.quit();
});
