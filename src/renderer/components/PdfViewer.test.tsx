import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// jsdom has no canvas and no pdf.js worker, so the library is stubbed and the
// component's own logic — paging, zoom, disabled edges, failure — is what gets
// exercised here. The real rendering path is covered by the E2E screenshot.
const getViewport = vi.fn(({ scale }: { scale: number }) => ({
  width: 200 * scale,
  height: 300 * scale,
}));
const renderPage = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }));
const getPage = vi.fn((n: number) =>
  Promise.resolve({ pageNumber: n, getViewport, render: renderPage }),
);
const destroy = vi.fn();
const getDocument = vi.fn(() => ({
  promise: Promise.resolve({ numPages: 3, getPage, destroy }),
}));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: (...args: unknown[]) => getDocument(...(args as [])),
}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.js' }));

const { PdfViewer } = await import('./PdfViewer');

const FALLBACK = <div data-testid="fallback">could not read</div>;

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom's canvas has no 2D context; the component bails out of drawing
  // gracefully, which is fine — we assert on the controls, not the pixels.
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
  global.fetch = vi.fn(() =>
    Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
  ) as never;
});

describe('PdfViewer', () => {
  it('loads from a url and reports the page count', async () => {
    render(<PdfViewer source={{ url: 'ariadne-blob://abc' }} label="a.pdf" fallback={FALLBACK} />);
    expect(await screen.findByText('Page 1 of 3')).toBeInTheDocument();
    // Only the URL matters here; the second arg is the abort signal.
    expect(vi.mocked(global.fetch).mock.calls[0]?.[0]).toBe('ariadne-blob://abc');
  });

  it('loads from raw bytes without fetching — the path a generated report uses', async () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    render(<PdfViewer source={{ data }} label="report.pdf" fallback={FALLBACK} />);
    expect(await screen.findByText('Page 1 of 3')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
    // The caller's array must survive: getDocument detaches what it is given.
    expect(data).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('pages forward and back, disabling the controls at both ends', async () => {
    render(<PdfViewer source={{ url: 'x' }} label="a.pdf" fallback={FALLBACK} />);
    await screen.findByText('Page 1 of 3');

    const prev = screen.getByRole('button', { name: '‹ Prev' });
    const next = screen.getByRole('button', { name: 'Next ›' });
    expect(prev).toBeDisabled();

    await userEvent.click(next);
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    expect(prev).toBeEnabled();

    await userEvent.click(next);
    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument();
    expect(next).toBeDisabled();

    await userEvent.click(prev);
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
  });

  it('zooms through the steps and stops at the ends', async () => {
    render(<PdfViewer source={{ url: 'x' }} label="a.pdf" fallback={FALLBACK} />);
    await screen.findByText('Page 1 of 3');
    expect(screen.getByText('100%')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByText('125%')).toBeInTheDocument();

    const out = screen.getByRole('button', { name: 'Zoom out' });
    await userEvent.click(out);
    await userEvent.click(out);
    await userEvent.click(out);
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(out).toBeDisabled();
  });

  it('shows the caller’s fallback when the document cannot be parsed', async () => {
    getDocument.mockReturnValueOnce({ promise: Promise.reject(new Error('bad pdf')) });
    render(<PdfViewer source={{ url: 'x' }} label="a.pdf" fallback={FALLBACK} />);
    expect(await screen.findByTestId('fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('pdf-viewer')).not.toBeInTheDocument();
  });

  it('shows the fallback when the bytes cannot be fetched', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('offline')));
    render(<PdfViewer source={{ url: 'x' }} label="a.pdf" fallback={FALLBACK} />);
    expect(await screen.findByTestId('fallback')).toBeInTheDocument();
  });

  it('destroys the document when unmounted, so the worker is released', async () => {
    const { unmount } = render(
      <PdfViewer source={{ url: 'x' }} label="a.pdf" fallback={FALLBACK} />,
    );
    await screen.findByText('Page 1 of 3');
    unmount();
    await waitFor(() => {
      expect(destroy).toHaveBeenCalled();
    });
  });
});
