import { webcrypto } from 'node:crypto';

// Node 18 does not expose WebCrypto globally (Node 19+ does); Electron's main
// and renderer processes always do. Align the node test environment with the
// production runtimes so shared/ code can assume `crypto` exists.
// @types/node@18 has no global `crypto` declaration, hence the local view.
const globals = globalThis as { crypto?: unknown };
if (typeof globals.crypto === 'undefined') {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
}
