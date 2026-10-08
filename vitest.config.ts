import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer'),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          // `*.node.test.ts` lets a renderer-adjacent test that needs the
          // filesystem — the theme contract reads the stylesheets as text —
          // live beside what it checks without giving the renderer node types.
          include: ['src/{shared,main,preload,mcp}/**/*.test.ts', 'src/renderer/**/*.node.test.ts'],
          setupFiles: ['vitest.setup.node.ts'],
        },
      },
      {
        extends: true,
        plugins: [react()],
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['src/renderer/**/*.test.{ts,tsx}'],
          // …and out of the jsdom project, or it runs in both.
          exclude: ['src/renderer/**/*.node.test.ts'],
          setupFiles: ['src/renderer/test-setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: [
        '**/*.test.*',
        '**/*.d.ts',
        // Electron bootstrap, ipcMain routing glue, and contextBridge glue: no
        // domain logic; exercised by the Playwright E2E suite, which vitest
        // coverage cannot instrument.
        'src/main/index.ts',
        'src/main/ipc.ts',
        // Tray + flyout window plumbing (D51); its placement maths is the
        // pure, tested flyout-position.ts, the rest is exercised by E2E.
        'src/main/quick-add-tray.ts',
        // Embedded icon bytes, no code.
        'src/main/tray-icon.ts',
        'src/preload/**',
        // DOM mount point only; exercised by E2E.
        'src/renderer/main.tsx',
        // Test-only infrastructure, not shipped code.
        'src/renderer/test-setup.ts',
        'src/renderer/test-utils.tsx',
      ],
      // Sprint exit gate: >=80% everywhere. These thresholds are never lowered.
      thresholds: {
        lines: 80,
        statements: 80,
        branches: 80,
        functions: 80,
      },
    },
  },
});
