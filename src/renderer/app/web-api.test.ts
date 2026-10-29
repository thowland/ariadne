import { WEB_COUNTS_HEADER, WEB_CSRF_HEADER, WEB_ROUTES } from '@shared/web-contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createWebApi, pickFile } from './web-api';

const fetchMock = vi.fn<typeof fetch>();

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  // window.open is spied on in more than one test; start each from zero calls.
  vi.restoreAllMocks();
});

/** Make the next file picker opened by web-api choose `file` (or cancel). */
function nextPick(file: File | null): void {
  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementationOnce(function (
    this: HTMLInputElement,
  ) {
    if (file === null) {
      this.dispatchEvent(new Event('cancel'));
      return;
    }
    Object.defineProperty(this, 'files', { value: [file], configurable: true });
    this.dispatchEvent(new Event('change'));
  });
}

describe('createWebApi (D55)', () => {
  it('posts JSON with the CSRF header and returns the reply', async () => {
    fetchMock.mockResolvedValueOnce(json({ rejected: [] }));
    const api = createWebApi();
    expect(await api.saveCollections({ tasks: [] })).toEqual({ rejected: [] });
    const [path, init] = fetchMock.mock.calls[0]!;
    expect(path).toBe(WEB_ROUTES.workspaceSave);
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)[WEB_CSRF_HEADER]).toBe('1');
    expect(init?.body).toBe('{"tasks":[]}');
  });

  it('turns a server error into a rejected promise carrying its message', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'Disk full' }, { status: 500 }));
    await expect(createWebApi().runBackupNow()).rejects.toThrow('Disk full');
    fetchMock.mockResolvedValueOnce(new Response('oops', { status: 502 }));
    await expect(createWebApi().getAppInfo()).rejects.toThrow('Server error (502)');
  });

  it('uploads blob bytes with PUT', async () => {
    fetchMock.mockResolvedValueOnce(json({ size: 3 }));
    expect(await createWebApi().saveBlob('f1', 'pdf', new Uint8Array([1, 2, 3]).buffer)).toEqual({
      size: 3,
    });
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/blob/f1?ext=pdf');
    expect(fetchMock.mock.calls[0]![1]?.method).toBe('PUT');
  });

  it('downloads exports under the name the server suggests, with archive counts', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{}', {
        headers: {
          'Content-Disposition': `attachment; filename="a.json"; filename*=UTF-8''b%C3%A9.json`,
        },
      }),
    );
    expect(await createWebApi().exportWorkspace()).toEqual({ savedPath: 'bé.json' });

    const counts = { projects: 1, tasks: 2, files: 0, contacts: 0, blobs: 0 };
    fetchMock.mockResolvedValueOnce(
      new Response('zip', {
        headers: {
          'Content-Disposition': 'attachment; filename="ariadne-archive.zip"',
          [WEB_COUNTS_HEADER]: JSON.stringify(counts),
        },
      }),
    );
    expect(await createWebApi().exportArchive()).toEqual({
      savedPath: 'ariadne-archive.zip',
      counts,
    });

    fetchMock.mockResolvedValueOnce(json({ error: 'Nothing to export yet' }, { status: 409 }));
    expect(await createWebApi().exportWorkspace()).toEqual({
      savedPath: null,
      error: 'Nothing to export yet',
    });
  });

  it('saves a markdown note or a stored file as a download', async () => {
    const api = createWebApi();
    expect(await api.downloadFile({ content: '# Hi', suggestedName: 'n.md' })).toEqual({
      savedPath: 'n.md',
    });
    fetchMock.mockResolvedValueOnce(new Response('bytes'));
    expect(await api.downloadFile({ fileId: 'f1', suggestedName: 'a.pdf' })).toEqual({
      savedPath: 'a.pdf',
    });
    fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }));
    expect(
      (await api.downloadFile({ fileId: 'gone', suggestedName: 'a.pdf' })).savedPath,
    ).toBeNull();
    expect(await api.downloadFile({ suggestedName: 'x' })).toEqual({
      savedPath: null,
      error: 'Nothing to download',
    });
  });

  it('imports a picked JSON file through the server, and reports a cancelled pick', async () => {
    nextPick(new File(['{"projects":[]}'], 'w.json'));
    fetchMock.mockResolvedValueOnce(json({ ok: true, workspace: {}, warnings: [] }));
    expect((await createWebApi().importFromFile()).ok).toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({
      text: '{"projects":[]}',
    });

    nextPick(null);
    expect(await createWebApi().importFromFile()).toEqual({
      ok: false,
      error: 'Import cancelled',
      cancelled: true,
    });
  });

  it('reads a picked CSV locally', async () => {
    nextPick(new File(['a,b'], 'people.csv'));
    expect(await createWebApi().pickCsvFile()).toEqual({
      ok: true,
      name: 'people.csv',
      text: 'a,b',
    });
  });

  it('uploads a picked archive', async () => {
    nextPick(new File(['zip'], 'a.zip'));
    fetchMock.mockResolvedValueOnce(json({ ok: true, workspace: {}, warnings: [], blobs: 0 }));
    expect((await createWebApi().importArchive()).ok).toBe(true);
    expect(fetchMock.mock.calls[0]![0]).toBe(WEB_ROUTES.importArchive);
  });

  it('prints a report in a new tab, or asks for pop-ups', async () => {
    const win = { addEventListener: vi.fn(), focus: vi.fn(), print: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValueOnce(win as unknown as Window);
    expect(
      await createWebApi().exportReportPdf({ html: '<p>r</p>', suggestedName: 'r.pdf' }),
    ).toEqual({
      savedPath: null,
    });
    expect(open).toHaveBeenCalledWith('blob:x', '_blank');
    const onLoad = win.addEventListener.mock.calls[0]![1] as () => void;
    onLoad();
    expect(win.print).toHaveBeenCalled();

    open.mockReturnValueOnce(null);
    expect(
      (await createWebApi().exportReportPdf({ html: '', suggestedName: 'r.pdf' })).error,
    ).toContain('pop-ups');
  });

  it('opens only safe external links, in a new tab', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const api = createWebApi();
    await api.openExternal('https://example.com');
    await api.openExternal('javascript:alert(1)');
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
  });

  it('answers desktop-only features harmlessly', async () => {
    const api = createWebApi();
    expect(api.blobBaseUrl).toBe('/api/blob/');
    expect(api.insetTitlebar).toBe(false);
    await expect(api.setBadge(3)).resolves.toBeUndefined();
    expect(await api.chooseBackupDir()).toEqual({ path: null });
    expect((await api.revealLogFile()).ok).toBe(false);
    expect((await api.submitQuickAdd({} as never)).ok).toBe(false);
    fetchMock.mockResolvedValueOnce(json({ path: '/srv/data' }));
    expect(await api.chooseDataDir()).toEqual({
      mode: 'unchanged',
      path: '/srv/data',
      relaunching: false,
    });
  });

  it('pickFile resolves null when the picker is cancelled', async () => {
    nextPick(null);
    expect(await pickFile('.zip')).toBeNull();
  });

  it('streams save-status events from the server', () => {
    const listeners: Record<string, (e: MessageEvent<string>) => void> = {};
    const urls: string[] = [];
    class FakeEventSource {
      constructor(url: string) {
        urls.push(url);
      }
      addEventListener(type: string, cb: (e: MessageEvent<string>) => void): void {
        listeners[type] = cb;
      }
    }
    vi.stubGlobal('EventSource', FakeEventSource);
    const seen: unknown[] = [];
    createWebApi().onSaveStatus((s) => {
      seen.push(s);
    });
    expect(urls).toEqual([WEB_ROUTES.events]);
    listeners['save-status']!({ data: '{"ok":false,"name":"tasks"}' } as MessageEvent<string>);
    expect(seen).toEqual([{ ok: false, name: 'tasks' }]);
  });

  it('sends log lines without ever failing the caller', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(() => {
      createWebApi().logEvent('app', 'hello');
    }).not.toThrow();
    await Promise.resolve();
    const [path, init] = fetchMock.mock.calls[0]!;
    expect(path).toBe(WEB_ROUTES.logEvent);
    expect(JSON.parse(init!.body as string)).toEqual({ category: 'app', message: 'hello' });
  });

  it('routes Todoist, Claude and folder questions to the server', async () => {
    const api = createWebApi();
    fetchMock.mockImplementation(() => Promise.resolve(json({ ok: true })));
    await api.todoistCompleted('t', '2026-01-01', '2026-01-02');
    await api.todoistPush('t', []);
    await api.aiExtract({ apiKey: 'k', text: 'notes', projectNames: [] });
    await api.getLogInfo();
    await api.getDataDir();
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      WEB_ROUTES.todoistCompleted,
      WEB_ROUTES.todoistPush,
      WEB_ROUTES.aiExtract,
      WEB_ROUTES.logInfo,
      WEB_ROUTES.dataDir,
    ]);
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({
      token: 't',
      since: '2026-01-01',
      until: '2026-01-02',
    });
  });

  it('reports upload and archive failures', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'Request too large' }, { status: 413 }));
    await expect(createWebApi().saveBlob('f1', 'bin', new ArrayBuffer(1))).rejects.toThrow(
      'Request too large',
    );
    nextPick(new File(['zip'], 'a.zip'));
    fetchMock.mockResolvedValueOnce(json({ error: 'Request too large' }, { status: 413 }));
    expect(await createWebApi().importArchive()).toEqual({ ok: false, error: 'Request too large' });
  });

  it('says so when a picked CSV cannot be read', async () => {
    const broken = new File(['x'], 'people.csv');
    broken.text = () => Promise.reject(new Error('locked'));
    nextPick(broken);
    expect(await createWebApi().pickCsvFile()).toEqual({
      ok: false,
      error: 'Could not read that file',
    });
  });
});
