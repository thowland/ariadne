import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadTestWorkspace, setupTestApp } from '../test-utils';

import { downloadFile, removeFileWithConfirm, uploadFiles } from './files';
import { useStore } from './store';

function ws() {
  const w = useStore.getState().workspace;
  if (w === null) throw new Error('no workspace');
  return w;
}

beforeEach(() => {
  setupTestApp();
  loadTestWorkspace();
});

describe('uploadFiles', () => {
  it('registers metadata, stores bytes, and toasts', async () => {
    const api = window.ariadne;
    const file = new File(['col1,col2\n1,2'], 'data.CSV', { type: 'text/csv' });
    await uploadFiles([file], 'p1', null);

    const entry = ws().files.find((f) => f.name === 'data.CSV');
    expect(entry).toMatchObject({ kind: 'file', ext: 'csv', projectId: 'p1', taskId: null });
    expect(api.saveBlob).toHaveBeenCalledWith(entry?.id, 'csv', expect.any(ArrayBuffer));
    expect(useStore.getState().toast).toBe('1 file added to library');
  });

  it('attaches to a task when taskId is given', async () => {
    await uploadFiles([new File(['x'], 'shot.png', { type: 'image/png' })], 'p1', 't2');
    expect(ws().files.find((f) => f.name === 'shot.png')?.taskId).toBe('t2');
  });

  it('toasts per-file failures without aborting the batch', async () => {
    vi.mocked(window.ariadne.saveBlob).mockRejectedValueOnce(new Error('disk full'));
    await uploadFiles(
      [new File(['a'], 'bad.bin'), new File(['b'], 'good.txt', { type: 'text/plain' })],
      'p1',
      null,
    );
    expect(ws().files.some((f) => f.name === 'good.txt')).toBe(true);
    expect(useStore.getState().toast).toBe('1 file added to library');
  });

  it('does nothing for an empty list', async () => {
    await uploadFiles([], 'p1', null);
    expect(window.ariadne.saveBlob).not.toHaveBeenCalled();
  });
});

describe('downloadFile', () => {
  it('sends markdown content and blob ids appropriately', () => {
    const md = ws().files.find((f) => f.id === 'fa');
    if (md === undefined) throw new Error('missing seed file');
    downloadFile(md);
    expect(window.ariadne.downloadFile).toHaveBeenCalledWith({
      content: md.content,
      suggestedName: 'Migration overview.md',
    });
  });

  it('refuses ref entries with a toast', () => {
    const ref = ws().files.find((f) => f.kind === 'ref');
    if (ref === undefined) throw new Error('missing seed ref');
    downloadFile(ref);
    expect(window.ariadne.downloadFile).not.toHaveBeenCalled();
    expect(useStore.getState().toast).toMatch(/Reference only/);
  });

  it('surfaces main-process errors as toasts', async () => {
    vi.mocked(window.ariadne.downloadFile).mockResolvedValue({
      savedPath: null,
      error: 'No stored file to download',
    });
    const md = ws().files.find((f) => f.id === 'fa');
    downloadFile(md!);
    await vi.waitFor(() => {
      expect(useStore.getState().toast).toBe('No stored file to download');
    });
  });
});

describe('removeFileWithConfirm', () => {
  it('deletes the record, removes blob bytes for binaries, closes its viewer', async () => {
    // Make a binary file entry.
    await uploadFiles([new File(['x'], 'doc.pdf', { type: 'application/pdf' })], 'p1', null);
    const entry = ws().files.find((f) => f.name === 'doc.pdf');
    if (entry === undefined) throw new Error('upload failed');
    useStore.getState().openFile(entry.id);

    removeFileWithConfirm(entry);
    useStore.getState().resolveConfirm(true);
    await vi.waitFor(() => {
      expect(ws().files.some((f) => f.id === entry.id)).toBe(false);
    });
    expect(window.ariadne.deleteBlobs).toHaveBeenCalledWith([entry.id]);
    expect(useStore.getState().modal).toBeNull();
  });

  it('keeps everything when cancelled', async () => {
    const md = ws().files.find((f) => f.id === 'fa');
    removeFileWithConfirm(md!);
    useStore.getState().resolveConfirm(false);
    await vi.waitFor(() => {
      expect(useStore.getState().confirmState).toBeNull();
    });
    expect(ws().files.some((f) => f.id === 'fa')).toBe(true);
  });
});
