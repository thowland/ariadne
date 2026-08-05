import { replaceWorkspace } from '@shared/domain/mutate';
import type { ImportResponse } from '@shared/ipc-contract';
import type { Workspace } from '@shared/types';

import { getApi } from './api';
import { useStore } from './store';

/**
 * Whole-workspace import/export flows, shared by the Settings buttons and the
 * File menu so both routes behave identically (same toasts, same navigation,
 * same in-memory replacement).
 */

function adopt(workspace: Workspace, suffix: string): void {
  const { apply, go, showToast } = useStore.getState();
  apply(() => replaceWorkspace(workspace));
  go('home');
  showToast(
    `Imported ${String(workspace.projects.length)} projects, ${String(workspace.tasks.length)} tasks${suffix}`,
  );
}

/** Apply a JSON import result (file or pasted text). */
export function finishJsonImport(res: ImportResponse): boolean {
  if (!res.ok) {
    if (res.cancelled !== true) useStore.getState().showToast(res.error);
    return false;
  }
  adopt(res.workspace, '');
  return true;
}

export async function runJsonExport(): Promise<void> {
  const { showToast } = useStore.getState();
  const res = await getApi().exportWorkspace();
  if (res.error !== undefined) showToast(res.error);
  else if (res.savedPath !== null) showToast('Exported JSON backup');
}

export async function runJsonImportFile(): Promise<void> {
  finishJsonImport(await getApi().importFromFile());
}

/** Zip archive of the workspace and every uploaded file (D22). */
export async function runArchiveExport(): Promise<void> {
  const { showToast } = useStore.getState();
  const res = await getApi().exportArchive();
  if (res.error !== undefined) {
    showToast(res.error);
    return;
  }
  if (res.savedPath === null) return; // cancelled
  const files = res.counts?.blobs ?? 0;
  showToast(`Archive saved — ${String(files)} file${files === 1 ? '' : 's'} included`);
}

/** Restore from a zip archive; replaces everything after a confirmation. */
export async function runArchiveImport(): Promise<void> {
  const { askConfirm, showToast } = useStore.getState();
  const ok = await askConfirm('Replace this workspace with the contents of an archive?');
  if (!ok) return;
  const res = await getApi().importArchive();
  if (!res.ok) {
    if (res.cancelled !== true) showToast(res.error);
    return;
  }
  adopt(res.workspace, res.blobs > 0 ? `, ${String(res.blobs)} files` : '');
}

export async function runBackupNow(): Promise<void> {
  const { showToast } = useStore.getState();
  const res = await getApi().runBackupNow();
  showToast(
    res.ok ? `Backed up to ${res.path ?? 'backup folder'}` : (res.error ?? 'Backup failed'),
  );
}
