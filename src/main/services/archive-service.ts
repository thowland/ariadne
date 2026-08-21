import { readFile, writeFile } from 'node:fs/promises';

import { newId } from '@shared/domain/id';
import { buildExport, parseImport } from '@shared/schema/import-export';
import type { Workspace } from '@shared/types';
import AdmZip from 'adm-zip';

import type { BlobService } from './blob-service';
import type { StorageService } from './storage-service';

/**
 * Whole-workspace archive (D22): a single .zip holding the workspace JSON and
 * every uploaded file as real bytes, instead of the base64 data URLs the
 * legacy .json export inlines. Archives stay an order of magnitude smaller,
 * and the blobs inside can be opened with any zip tool.
 *
 * Layout:
 *   manifest.json      — format marker, app version, counts
 *   workspace.json     — the ExportDocument (`_blobs` empty; bytes live below)
 *   blobs/<id>.<ext>   — one entry per stored binary file
 */

export const ARCHIVE_FORMAT = 'ariadne-archive';
export const ARCHIVE_FORMAT_VERSION = 1;

const WORKSPACE_ENTRY = 'workspace.json';
const MANIFEST_ENTRY = 'manifest.json';
const BLOB_PREFIX = 'blobs/';

export interface ArchiveManifest {
  format: string;
  formatVersion: number;
  appVersion: string;
  exportedAt: string;
  counts: { projects: number; tasks: number; files: number; contacts: number; blobs: number };
}

export type ArchiveExportResult =
  { ok: true; counts: ArchiveManifest['counts']; bytes: number } | { ok: false; error: string };

export type ArchiveImportResult =
  | { ok: true; workspace: Workspace; warnings: string[]; blobs: number }
  | { ok: false; error: string };

/** `blobs/<id>.<ext>` → id, or null for anything path-like or nested. */
export function blobIdFromEntry(entryName: string): string | null {
  if (!entryName.startsWith(BLOB_PREFIX)) return null;
  const name = entryName.slice(BLOB_PREFIX.length);
  if (name === '' || name.includes('/') || name.includes('\\')) return null;
  const id = name.split('.')[0] ?? '';
  // Ids are UUID-shaped; anything else could escape the blobs directory.
  return /^[\w-]+$/.test(id) ? id : null;
}

export class ArchiveService {
  constructor(
    private readonly storage: StorageService,
    private readonly blobs: BlobService,
    private readonly appVersion: string,
  ) {}

  /** Write the flushed on-disk workspace plus every blob to `targetPath`. */
  async exportTo(
    targetPath: string,
    now: () => Date = () => new Date(),
  ): Promise<ArchiveExportResult> {
    await this.storage.flushAll();
    const { workspace } = await this.storage.loadWorkspace();
    if (workspace === null) return { ok: false, error: 'Nothing to export yet' };

    const zip = new AdmZip();
    let blobCount = 0;
    for (const file of workspace.files) {
      if (file.kind !== 'file') continue;
      const path = this.blobs.find(file.id);
      if (path === null) continue;
      const ext = /^[a-z0-9]{1,8}$/i.test(file.ext) ? `.${file.ext.toLowerCase()}` : '';
      zip.addFile(`${BLOB_PREFIX}${file.id}${ext}`, await readFile(path));
      blobCount += 1;
    }

    const counts = {
      projects: workspace.projects.length,
      tasks: workspace.tasks.length,
      files: workspace.files.length,
      contacts: workspace.contacts.length,
      blobs: blobCount,
    };
    const manifest: ArchiveManifest = {
      format: ARCHIVE_FORMAT,
      formatVersion: ARCHIVE_FORMAT_VERSION,
      appVersion: this.appVersion,
      exportedAt: now().toISOString(),
      counts,
    };
    zip.addFile(MANIFEST_ENTRY, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'));
    zip.addFile(
      WORKSPACE_ENTRY,
      Buffer.from(`${JSON.stringify(buildExport(workspace, {}), null, 2)}\n`, 'utf8'),
    );

    // Written by hand rather than via zip.writeZipPromise: that helper reports
    // write failures as an uncaught async exception instead of rejecting,
    // which would take down the main process on a full or read-only disk.
    const bytes = zip.toBuffer();
    try {
      await writeFile(targetPath, bytes);
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Could not write the archive',
      };
    }
    return { ok: true, counts, bytes: bytes.byteLength };
  }

  /** Replace the workspace (and all blobs) from an archive written by exportTo. */
  async importFrom(sourcePath: string): Promise<ArchiveImportResult> {
    let zip: AdmZip;
    try {
      zip = new AdmZip(sourcePath);
    } catch {
      return { ok: false, error: 'Could not read the archive — is it a valid .zip?' };
    }

    const workspaceEntry = zip.getEntry(WORKSPACE_ENTRY);
    if (workspaceEntry === null) {
      return { ok: false, error: `Not an Ariadne archive (no ${WORKSPACE_ENTRY})` };
    }

    const parsed = parseImport(zip.readAsText(workspaceEntry), newId);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const { workspace, warnings } = parsed.value;

    await this.storage.saveWorkspaceNow(workspace);

    // Blob bytes: only entries whose id matches a file record we just kept,
    // and only flat names under blobs/ (never a path that could escape it).
    const wanted = new Map(workspace.files.filter((f) => f.kind === 'file').map((f) => [f.id, f]));
    let restored = 0;
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const id = blobIdFromEntry(entry.entryName);
      const record = id === null ? undefined : wanted.get(id);
      if (id === null || record === undefined) continue;
      await this.blobs.save(id, record.ext, entry.getData());
      restored += 1;
    }

    // Legacy .json exports carry their bytes inline; honor those too so a
    // hand-assembled archive built from one still restores its files.
    for (const [id, dataUrl] of Object.entries(parsed.value.blobs)) {
      const record = wanted.get(id);
      if (record === undefined) continue;
      await this.blobs.save(
        id,
        record.ext,
        Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'),
      );
      restored += 1;
    }

    return { ok: true, workspace, warnings, blobs: restored };
  }
}
