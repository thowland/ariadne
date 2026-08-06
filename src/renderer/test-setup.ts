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

// jsdom (as of v25) lacks Blob.prototype.arrayBuffer, which the upload flow
// uses; production Chromium always has it.
if (typeof Blob.prototype.arrayBuffer !== 'function') {
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(reader.result as ArrayBuffer);
      };
      reader.onerror = () => {
        reject(new Error('read failed'));
      };
      reader.readAsArrayBuffer(this);
    });
  };
}
