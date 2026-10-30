import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { resolve } from 'node:path';

import { defineConfig } from 'vite';

const { version } = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as {
  version: string;
};

/**
 * Builds the web server (D55) into one file, the way vite.mcp.config.ts
 * builds the MCP server: everything but Node's own modules is inlined, so
 * out/server/server.mjs runs with plain `node` and needs no node_modules.
 */
export default defineConfig({
  resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
  define: { __ARIADNE_VERSION__: JSON.stringify(version) },
  build: {
    ssr: true,
    target: 'node22',
    outDir: 'out/server',
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      input: resolve(__dirname, 'src/server/main.ts'),
      external: [...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
      output: { entryFileNames: 'server.mjs', format: 'esm' },
    },
  },
  ssr: { noExternal: true },
});
