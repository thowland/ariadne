import { builtinModules } from 'node:module';
import { resolve } from 'node:path';

import { defineConfig } from 'vite';

/**
 * Builds the read-only MCP server (D39) into a single file.
 *
 * A separate config rather than a fourth electron-vite section: this is not
 * part of the desktop app, it is a plain Node process a Claude client spawns.
 * Bundling means it has no runtime dependencies at all — it can be copied
 * anywhere and run with `node`, and nothing in `node_modules` has to survive
 * for it to work.
 */
export default defineConfig({
  resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
  build: {
    ssr: true,
    target: 'node22',
    outDir: 'out/mcp',
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      input: resolve(__dirname, 'src/mcp/server.ts'),
      // Node's own modules stay external; everything else is inlined.
      external: [...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
      output: { entryFileNames: 'server.mjs', format: 'esm' },
    },
  },
});
