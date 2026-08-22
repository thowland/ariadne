import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

// pdf.js 6 evaluates the canvas geometry types at *import* time, so any test
// file that transitively imports PdfViewer dies on module load without these.
// jsdom implements none of them; production Chromium implements all three.
// Minimal stand-ins only — no test renders a real page, and the ones that
// exercise the viewer mock pdfjs outright.
const g = globalThis as Record<string, unknown>;
if (typeof g.DOMMatrix === 'undefined') {
  g.DOMMatrix = class DOMMatrix {
    constructor(readonly init?: unknown) {}
    multiplySelf(): this {
      return this;
    }
    translateSelf(): this {
      return this;
    }
    scaleSelf(): this {
      return this;
    }
  };
}
if (typeof g.Path2D === 'undefined') {
  g.Path2D = class Path2D {
    // Geometry is never read back in tests; these exist so pdf.js can call
    // them without throwing.
    addPath(): undefined {
      return undefined;
    }
    moveTo(): undefined {
      return undefined;
    }
    lineTo(): undefined {
      return undefined;
    }
    closePath(): undefined {
      return undefined;
    }
  };
}
if (typeof g.ImageData === 'undefined') {
  g.ImageData = class ImageData {
    readonly data: Uint8ClampedArray;
    constructor(
      readonly width: number,
      readonly height: number,
    ) {
      this.data = new Uint8ClampedArray(width * height * 4);
    }
  };
}

// jsdom implements no media queries at all, and the theme (D38) asks it
// whether the OS wants dark. A stub that reports "light" and accepts
// listeners is enough; the tests that care about dark set the choice
// explicitly, which never consults this.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}

// The Blob.prototype.arrayBuffer shim that used to live here is gone: jsdom
// implements it natively as of v30 (it did not in v25), so the polyfill was
// dead code the moment jsdom was bumped.
