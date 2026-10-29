import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BackupService } from '../main/services/backup-service';
import { BlobService } from '../main/services/blob-service';
import { DebugLogService } from '../main/services/debug-log-service';
import { StorageService } from '../main/services/storage-service';

import { isAllowedHost } from './http';
import { createApi } from './routes';
import { createStaticHandler } from './static';

/**
 * Ariadne as a web app (D55): one Node process that keeps the workspace in a
 * data folder exactly as the desktop app did, serves the React app, and
 * answers its API calls. Configured through the environment:
 *
 *   ARIADNE_DATA_DIR      data folder (default ~/.ariadne-web/data)
 *   PORT                  default 4318
 *   HOST                  default 127.0.0.1 (this machine only)
 *   ARIADNE_ALLOW_REMOTE  set to 1 to listen on a non-loopback HOST; there is
 *                         no sign-in, so only do that behind a proxy that
 *                         authenticates
 *   ARIADNE_ALLOWED_HOSTS extra host names browsers may use, comma-separated
 *   ARIADNE_WEB_ROOT      built web app (default out/web beside this server)
 *   ARIADNE_FAKE_TODAY    pin "today" for demos and tests, as on desktop
 */

// Replaced at build time by vite.server.config.ts; absent when run unbundled.
declare const __ARIADNE_VERSION__: string | undefined;
const VERSION = typeof __ARIADNE_VERSION__ === 'string' ? __ARIADNE_VERSION__ : 'dev';

const env = process.env;
const host = env.HOST ?? '127.0.0.1';
const port = Number(env.PORT ?? 4318);
const loopback = ['127.0.0.1', '::1', 'localhost'];

if (!loopback.includes(host) && env.ARIADNE_ALLOW_REMOTE !== '1') {
  console.error(
    `Refusing to listen on ${host}: Ariadne has no sign-in. Set ARIADNE_ALLOW_REMOTE=1 ` +
      'only when a proxy in front of it authenticates every request.',
  );
  process.exit(1);
}

const home = join(homedir(), '.ariadne-web');
const dataDir = resolve(env.ARIADNE_DATA_DIR ?? join(home, 'data'));
const webRoot = resolve(
  env.ARIADNE_WEB_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '../web'),
);
const allowedHosts = [
  ...loopback,
  host,
  ...(env.ARIADNE_ALLOWED_HOSTS ?? '').split(',').map((h) => h.trim().toLowerCase()),
].filter((h) => h !== '');

const debug = new DebugLogService(join(home, 'logs'));
debug.configureFromSettingsFile(dataDir);
debug.log('app', `Ariadne web starting (v${VERSION}) — data dir: ${dataDir}`);
const backups = new BackupService(dataDir, undefined, (message) => {
  debug.log('backup', message);
});
const blobs = new BlobService(dataDir);
const storage = new StorageService(dataDir, backups);
storage.init();

const api = createApi({
  storage,
  backups,
  blobs,
  debugLog: debug,
  dataDir,
  version: VERSION,
  ...(env.ARIADNE_FAKE_TODAY !== undefined ? { fakeToday: env.ARIADNE_FAKE_TODAY } : {}),
});
storage.setWriteListener((status) => {
  debug.log(
    'storage',
    status.ok ? 'saves recovered' : `save FAILED (${status.name ?? '?'}): ${status.message ?? ''}`,
  );
  api.broadcastSaveStatus(status);
});
const serveStatic = createStaticHandler(webRoot);

// Daily backups, as on desktop: once at start, then checked hourly.
backups.runIfNeededToday();
setInterval(
  () => {
    backups.runIfNeededToday();
  },
  60 * 60 * 1000,
).unref();

const server = createServer((req, res) => {
  if (!isAllowedHost(req.headers.host, allowedHosts)) {
    res.writeHead(421, { 'Content-Type': 'text/plain' }).end('Unknown host');
    return;
  }
  void (async () => {
    if (!(await api.handle(req, res))) await serveStatic(req, res);
  })();
});

server.listen(port, host, () => {
  const shown = host.includes(':') ? `[${host}]` : host;
  console.log(`Ariadne is running at http://${shown}:${String(port)}  (data: ${dataDir})`);
});

/** On shutdown, write anything pending and refresh today's backup, as on quit. */
let stopping = false;
const stop = (): void => {
  if (stopping) return;
  stopping = true;
  debug.log('app', 'shutdown — flushing saves and refreshing today’s backup');
  server.close();
  void (async () => {
    try {
      await storage.flushAll();
      backups.runBackup();
    } finally {
      process.exit(0);
    }
  })();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
