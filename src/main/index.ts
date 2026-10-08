import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { BLOB_PROTOCOL, IPC, isOpenableExternally } from '@shared/ipc-contract';
import type { MenuCommand } from '@shared/ipc-contract';
import { app, BrowserWindow, Menu, net, protocol, shell } from 'electron';

import { registerIpc } from './ipc';
import { buildAppMenuTemplate } from './menu';
import { QuickAddTray } from './quick-add-tray';
import { BackupService } from './services/backup-service';
import { BlobService } from './services/blob-service';
import { ConfigService, DEFAULT_WINDOW_BOUNDS } from './services/config-service';
import { DebugLogService } from './services/debug-log-service';
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
let debugLog: DebugLogService | null = null;
let quitting = false;
let mainWindow: BrowserWindow | null = null;
let quickAdd: QuickAddTray | null = null;

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

const isMac = process.platform === 'darwin';

/**
 * Install the application menu. Data-touching items are pushed to the focused
 * renderer as MenuCommands (see main/menu.ts); the main process keeps only
 * window roles and external links.
 */
function installAppMenu(): void {
  const send = (command: MenuCommand): void => {
    // The main window, even while the menu-bar flyout (D51) has focus: the
    // flyout handles no menu commands, so sending them there would drop them.
    const target = mainWindow ?? BrowserWindow.getFocusedWindow();
    target?.webContents.send(IPC.menuCommand, command);
  };
  const template = buildAppMenuTemplate({
    isMac,
    isDev: process.env.ELECTRON_RENDERER_URL !== undefined,
    send,
    openExternal: (url) => {
      void shell.openExternal(url);
    },
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(config: ConfigService): void {
  const bounds = config.load().windowBounds;
  const win = new BrowserWindow({
    width: bounds?.width ?? DEFAULT_WINDOW_BOUNDS.width,
    height: bounds?.height ?? DEFAULT_WINDOW_BOUNDS.height,
    x: bounds?.x,
    y: bounds?.y,
    show: false,
    // macOS: the traffic lights float over the app's own top bar (the
    // renderer reserves room for them via the ariadne-inset-titlebar class).
    ...(isMac ? { titleBarStyle: 'hiddenInset' as const } : { autoHideMenuBar: true }),
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
    try {
      config.save({ ...config.load(), windowBounds: win.getBounds() });
    } catch (err) {
      // Losing window geometry must never block the window from closing.
      logger?.error(`window-state save failed: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  });
  win.on('closed', () => {
    mainWindow = null;
    // The flyout is a window too: left alive it would keep the app running
    // with nothing to file tasks into, and window-all-closed would never fire.
    quickAdd?.destroy();
  });

  // The renderer never opens windows; external links go through the OS, and
  // only the schemes on the shared allowlist do.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isOpenableExternally(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  loadRenderer(win);
}

/** Loads the renderer bundle; `hash` picks the menu-bar flyout's page (D51). */
function loadRenderer(win: BrowserWindow, hash?: string): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}${hash !== undefined ? `#${hash}` : ''}`);
  } else {
    void win.loadFile(
      join(__dirname, '../renderer/index.html'),
      hash !== undefined ? { hash } : {},
    );
  }
}

/** The small frameless window the menu-bar icon opens (D51). */
function createFlyoutWindow(size: { width: number; height: number }): BrowserWindow {
  const win = new BrowserWindow({
    ...size,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: 'Quick add',
    backgroundColor: '#f6f6f4',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  loadRenderer(win, 'quick-add');
  return win;
}

process.on('uncaughtException', (err) => {
  logger?.error(`uncaughtException: ${err.stack ?? err.message}`);
});

void app.whenReady().then(() => {
  const config = new ConfigService(app.getPath('userData'));
  logger = new LoggerService(app.getPath('userData'));
  logger.info(`Ariadne starting (v${app.getVersion()})`);
  const dataDir = config.resolveDataDir();
  const debug = new DebugLogService(join(app.getPath('userData'), 'logs'));
  debug.configureFromSettingsFile(dataDir);
  debug.log('app', `Ariadne starting (v${app.getVersion()}) — data dir: ${dataDir}`);
  debugLog = debug;
  backups = new BackupService(dataDir, undefined, (message) => {
    debug.log('backup', message);
  });
  const blobs = new BlobService(dataDir);
  storage = new StorageService(dataDir, backups);
  storage.init();
  // Disk-write health: log every failure, and tell the renderer so it can
  // show (and later clear) its "changes are not being saved" banner.
  storage.setWriteListener((status) => {
    if (status.ok) {
      logger?.info('saves recovered');
      debug.log('storage', 'saves recovered');
    } else {
      logger?.error(`save failed (${status.name ?? '?'}): ${status.message ?? ''}`);
      debug.log('storage', `save FAILED (${status.name ?? '?'}): ${status.message ?? ''}`);
    }
    mainWindow?.webContents.send(IPC.saveStatus, status);
  });
  quickAdd = new QuickAddTray({
    isMac,
    createFlyout: createFlyoutWindow,
    mainWindow: () => mainWindow,
    lastProjectId: () => config.load().lastQuickAddProjectId ?? null,
    rememberProject: (projectId) => {
      try {
        config.save({ ...config.load(), lastQuickAddProjectId: projectId });
      } catch (err) {
        logger?.error(`quick-add config save failed: ${err instanceof Error ? err.message : '?'}`);
      }
    },
    showMainWindow: () => {
      mainWindow?.show();
      mainWindow?.focus();
    },
  });
  registerIpc(storage, backups, blobs, config, dataDir, debug, quickAdd);

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

  installAppMenu();
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
  debugLog?.log('app', 'quit requested — flushing saves and refreshing today’s backup');
  void (async () => {
    try {
      if (s !== null) {
        await s.flushAll();
        // flushOne no longer throws — failed writes stay pending instead.
        if (s.pendingCount() > 0) {
          logger?.error(`quit: ${String(s.pendingCount())} collection(s) could not be written`);
          debugLog?.log(
            'app',
            `quit: ${String(s.pendingCount())} collection(s) could not be written`,
          );
        }
      }
      const result = b?.runBackup();
      if (result !== undefined && !result.ok)
        logger?.error(`quit backup failed: ${result.error ?? ''}`);
      debugLog?.log('app', 'quitting');
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
