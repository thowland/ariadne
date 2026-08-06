import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BrowserWindow } from 'electron';

/**
 * Renders a report's HTML to PDF with Chromium's own print pipeline (D26).
 *
 * printToPDF produces real vector output with selectable text, which is why
 * reports export this way rather than through pdf.js — that library reads
 * PDFs, it cannot write them.
 *
 * The document is written to a temp file and loaded with loadFile rather than
 * a data: URL, which Chromium truncates on long documents.
 */
export class ReportPdfService {
  /** Injectable so tests can drive the whole path without a real window. */
  constructor(
    private readonly makeWindow: () => BrowserWindow = () =>
      new BrowserWindow({
        show: false,
        webPreferences: {
          // The markup is our own renderer's output and its user text is
          // already escaped by React, but this window exists only to be
          // printed: no scripts, no preload, no Node, fully sandboxed.
          javascript: false,
          sandbox: true,
          nodeIntegration: false,
          contextIsolation: true,
        },
      }),
  ) {}

  /** Returns the PDF bytes, or throws with a message fit for a toast. */
  async render(html: string): Promise<Buffer> {
    const dir = await mkdtemp(join(tmpdir(), 'ariadne-print-'));
    const page = join(dir, 'report.html');
    const win = this.makeWindow();
    try {
      await writeFile(page, html, 'utf8');
      await win.loadFile(page);
      return await win.webContents.printToPDF({
        printBackground: true,
        pageSize: 'Letter',
        margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
      });
    } finally {
      // Destroy before the temp dir goes, so nothing is mid-read.
      if (!win.isDestroyed()) win.destroy();
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
