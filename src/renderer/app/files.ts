import { deleteFile, registerUploadedFile } from '@shared/domain/mutate';
import type { FileEntry } from '@shared/types';

import { getApi } from './api';
import { useStore } from './store';

/**
 * File workflows shared by the project library and task attachments: upload
 * (metadata mutation + blob bytes over IPC), download (save dialog in main),
 * and delete (record + blob + viewer close).
 */

export async function uploadFiles(
  list: FileList | File[],
  projectId: string,
  taskId: string | null,
): Promise<void> {
  const files = [...list];
  if (files.length === 0) return;
  const { apply, showToast } = useStore.getState();

  let added = 0;
  for (const file of files) {
    try {
      const bytes = await file.arrayBuffer();
      const result = apply((ws, ctx) =>
        registerUploadedFile(ws, ctx, {
          projectId,
          taskId,
          name: file.name,
          mime: file.type,
          size: file.size,
        }),
      );
      if (result === null) continue;
      const entry = result.workspace.files.find((f) => f.id === result.id);
      await getApi().saveBlob(result.id, entry?.ext ?? '', bytes);
      added += 1;
    } catch {
      showToast(`Upload failed for “${file.name}”`);
    }
  }
  if (added > 0) showToast(`${added} file${added > 1 ? 's' : ''} added to library`);
}

export function downloadFile(file: FileEntry): void {
  const { showToast } = useStore.getState();
  if (file.kind === 'ref') {
    showToast('Reference only — no file stored to download');
    return;
  }
  const request =
    file.kind === 'markdown'
      ? { content: file.content, suggestedName: file.name }
      : { fileId: file.id, suggestedName: file.name };
  void getApi()
    .downloadFile(request)
    .then((res) => {
      if (res.error !== undefined) showToast(res.error);
      else if (res.savedPath !== null) showToast(`Saved ${file.name}`);
    });
}

export function removeFileWithConfirm(file: FileEntry): void {
  const { askConfirm, apply, showToast } = useStore.getState();
  void askConfirm(`Delete ${file.name}?`).then((ok) => {
    if (!ok) return;
    const result = apply((ws) => deleteFile(ws, file.id));
    if (result !== null && result.removedBlobIds.length > 0) {
      void getApi().deleteBlobs(result.removedBlobIds);
    }
    const { modal, closeModal } = useStore.getState();
    if (modal?.type === 'file' && modal.id === file.id) closeModal();
    showToast('File deleted');
  });
}
