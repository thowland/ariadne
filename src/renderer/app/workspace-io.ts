import { importProject, replaceWorkspace } from '@shared/domain/mutate';
import type { ImportResponse } from '@shared/ipc-contract';
import { parseProjectImport } from '@shared/schema/import-export';
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

/**
 * Add one project from a JSON file the user picked (D52), alongside what is
 * already here. The file is read in the renderer — it is the user's own pick
 * from an `<input type="file">`, the same route uploads take — so this needs
 * no IPC of its own. Returns whether a project was added.
 */
export async function runProjectJsonImport(file: File): Promise<boolean> {
  const { today, showToast } = useStore.getState();
  let text: string;
  try {
    text = await file.text();
  } catch {
    showToast(`Could not read “${file.name}”`);
    return false;
  }
  const parsed = parseProjectImport(text, today);
  if (!parsed.ok) {
    showToast(parsed.error);
    return false;
  }
  const { apply, openProject } = useStore.getState();
  const result = apply((ws, ctx) => importProject(ws, ctx, parsed.value));
  if (result === null) return false;
  openProject(result.id);
  const n = parsed.value.tasks.length;
  const name = parsed.value.project.name || 'Project';
  const notes = parsed.value.warnings.length > 0 ? ` — ${parsed.value.warnings.join('; ')}` : '';
  showToast(`Imported ${name} with ${String(n)} task${n === 1 ? '' : 's'}${notes}`);
  return true;
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
