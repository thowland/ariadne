import { createWebApi } from './web-api';

/**
 * Imported first by `main.tsx`, so it runs before any module that reads
 * `window.ariadne`. The desktop preload has already set it there; served
 * from the Ariadne web server nothing has, and the HTTP client stands in
 * (D55).
 */
const w = window as unknown as { ariadne?: Window['ariadne'] };
w.ariadne ??= createWebApi();
