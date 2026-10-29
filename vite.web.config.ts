import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Builds the React app for the web server (D55) into out/web, which
 * `out/server/server.mjs` serves. `npm run web:dev` runs Vite's dev server
 * with hot reload and forwards /api to a server started with `npm run
 * web:start` (or `web:serve`) on port 4318.
 */
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: '/',
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer'),
    },
  },
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'out/web'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://127.0.0.1:4318', changeOrigin: false } },
  },
});
