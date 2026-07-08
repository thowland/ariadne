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
          include: ['src/{shared,main,preload}/**/*.test.ts'],
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
        'src/preload/**',
        // DOM mount point only; exercised by E2E.
        'src/renderer/main.tsx',
        'src/renderer/test-setup.ts',
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
