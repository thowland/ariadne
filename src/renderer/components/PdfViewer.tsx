import * as pdfjs from 'pdfjs-dist';
// Bundled, never fetched: the app has to render PDFs with no network. Vite
// emits this as its own asset and hands us the packaged URL.
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useEffect, useRef, useState } from 'react';

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

/**
 * Where the bytes come from. `url` covers stored blobs; `data` is here so a
 * freshly generated report (webContents.printToPDF hands back a Buffer) can be
 * previewed without being written to disk first.
 */
export type PdfSource = { url: string } | { data: Uint8Array };

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const DEFAULT_ZOOM = 2; // index into ZOOM_STEPS → 1×

/**
 * Renders a PDF to canvas, one page at a time.
 *
 * Electron will not display a PDF in an embedded frame — Chromium's viewer is
 * wired up for top-level navigations only, so <object>/<iframe>/<embed> all
 * fall through to their fallback content regardless of webPreferences.plugins
 * or how the custom scheme is registered. Rendering it ourselves is the only
 * way to keep the preview inside the app.
 */
export function PdfViewer({
  source,
  label,
  fallback,
}: {
  source: PdfSource;
  label: string;
  /** Shown instead of the canvas when the document cannot be read. */
  fallback: React.JSX.Element;
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [failed, setFailed] = useState(false);

  const url = 'url' in source ? source.url : null;
  const data = 'data' in source ? source.data : null;

  // Load (and re-load when the source changes). Bytes are read here rather
  // than handed to pdf.js as a URL: pdf.js would issue its own ranged requests
  // against ariadne-blob://, which the protocol handler does not serve.
  useEffect(() => {
    // Doubles as the unmount signal and as a way to cancel an in-flight fetch.
    const ctrl = new AbortController();
    let loaded: pdfjs.PDFDocumentProxy | null = null;
    setDoc(null);
    setFailed(false);
    setPage(1);

    void (async () => {
      try {
        const bytes =
          url !== null
            ? new Uint8Array(await (await fetch(url, { signal: ctrl.signal })).arrayBuffer())
            : data;
        if (bytes === null) throw new Error('no source');
        // getDocument detaches the buffer it is given, so hand over a copy and
        // keep the caller's array intact for a re-render.
        loaded = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
        if (ctrl.signal.aborted) {
          void loaded.destroy();
          return;
        }
        setDoc(loaded);
      } catch {
        // An abort is an unmount, not a failure worth showing.
        if (!ctrl.signal.aborted) setFailed(true);
      }
    })();

    return () => {
      ctrl.abort();
      void loaded?.destroy();
    };
  }, [url, data]);

  // Draw the current page. A render task must be cancelled before another
  // starts on the same canvas, or pdf.js throws on the overlap.
  useEffect(() => {
    if (doc === null) return;
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let task: pdfjs.RenderTask | null = null;

    void (async () => {
      try {
        const p = await doc.getPage(page);
        const viewport = p.getViewport({ scale: ZOOM_STEPS[zoom] ?? 1 });
        const ctx = canvas.getContext('2d');
        if (ctx === null) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        task = p.render({ canvasContext: ctx, viewport });
        await task.promise;
      } catch {
        // A cancelled render is the normal result of paging quickly; only a
        // genuine load failure should surface, and that is handled above.
      }
    })();

    return () => {
      task?.cancel();
    };
  }, [doc, page, zoom]);

  if (failed) return fallback;

  const pages = doc?.numPages ?? 0;
  return (
    <div className="pdf-viewer" data-testid="pdf-viewer">
      <div className="pdf-toolbar">
        <button
          className="btn ghost small"
          disabled={page <= 1}
          onClick={() => {
            setPage((n) => Math.max(1, n - 1));
          }}
        >
          ‹ Prev
        </button>
        <span className="pdf-pageinfo" data-testid="pdf-pageinfo">
          {pages === 0 ? 'Loading…' : `Page ${String(page)} of ${String(pages)}`}
        </span>
        <button
          className="btn ghost small"
          disabled={pages === 0 || page >= pages}
          onClick={() => {
            setPage((n) => Math.min(pages, n + 1));
          }}
        >
          Next ›
        </button>
        <div className="pdf-zoom">
          <button
            className="btn ghost small"
            aria-label="Zoom out"
            disabled={zoom <= 0}
            onClick={() => {
              setZoom((z) => Math.max(0, z - 1));
            }}
          >
            −
          </button>
          <span className="pdf-zoomlevel">{`${String(Math.round((ZOOM_STEPS[zoom] ?? 1) * 100))}%`}</span>
          <button
            className="btn ghost small"
            aria-label="Zoom in"
            disabled={zoom >= ZOOM_STEPS.length - 1}
            onClick={() => {
              setZoom((z) => Math.min(ZOOM_STEPS.length - 1, z + 1));
            }}
          >
            +
          </button>
        </div>
      </div>
      <div className="pdf-canvas-wrap scr">
        <canvas ref={canvasRef} aria-label={label} />
      </div>
    </div>
  );
}
