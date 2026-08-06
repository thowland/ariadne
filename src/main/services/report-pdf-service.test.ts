import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

import type { BrowserWindow } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import { ReportPdfService } from './report-pdf-service';

/** A BrowserWindow stand-in that records what it was asked to do. */
function fakeWindow(
  overrides: {
    loadFile?: ReturnType<typeof vi.fn>;
    printToPDF?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const printToPDF = overrides.printToPDF ?? vi.fn().mockResolvedValue(Buffer.from('%PDF-1.4'));
  const loadFile = overrides.loadFile ?? vi.fn().mockResolvedValue(undefined);
  const destroy = vi.fn();
  const win = {
    loadFile,
    destroy,
    isDestroyed: () => false,
    webContents: { printToPDF },
  };
  return { win: win as unknown as BrowserWindow, loadFile, printToPDF, destroy };
}

const printDirs = (): string[] =>
  readdirSync(tmpdir()).filter((n) => n.startsWith('ariadne-print-'));

describe('ReportPdfService', () => {
  it('writes the html to a temp file, loads it, and returns the PDF bytes', async () => {
    const f = fakeWindow();
    const bytes = await new ReportPdfService(() => f.win).render('<html><body>hi</body></html>');

    expect(bytes.toString()).toBe('%PDF-1.4');
    expect(f.loadFile).toHaveBeenCalledTimes(1);
    const loaded = f.loadFile.mock.calls[0]?.[0] as string;
    expect(loaded).toMatch(/ariadne-print-.*report\.html$/);
  });

  it('prints backgrounds so progress bars and rules survive', async () => {
    const f = fakeWindow();
    await new ReportPdfService(() => f.win).render('<html></html>');
    expect(f.printToPDF).toHaveBeenCalledWith(
      expect.objectContaining({ printBackground: true, pageSize: 'Letter' }),
    );
  });

  it('destroys the window and removes the temp dir on success', async () => {
    const before = printDirs();
    const f = fakeWindow();
    await new ReportPdfService(() => f.win).render('<html></html>');
    expect(f.destroy).toHaveBeenCalled();
    expect(printDirs()).toEqual(before);
  });

  it('still cleans up when printing throws, and propagates the error', async () => {
    const before = printDirs();
    const f = fakeWindow({ printToPDF: vi.fn().mockRejectedValue(new Error('print failed')) });
    await expect(new ReportPdfService(() => f.win).render('<html></html>')).rejects.toThrow(
      'print failed',
    );
    expect(f.destroy).toHaveBeenCalled();
    expect(printDirs()).toEqual(before);
  });

  it('cleans up when the page itself fails to load', async () => {
    const before = printDirs();
    const f = fakeWindow({ loadFile: vi.fn().mockRejectedValue(new Error('load failed')) });
    await expect(new ReportPdfService(() => f.win).render('<html></html>')).rejects.toThrow(
      'load failed',
    );
    expect(f.destroy).toHaveBeenCalled();
    expect(printDirs()).toEqual(before);
  });
});
