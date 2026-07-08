import { readFile, writeFile } from 'node:fs/promises';

import { newId } from '@shared/domain/id';
import { buildExport, parseImport } from '@shared/schema/import-export';
import type { Workspace } from '@shared/types';

import type { BlobService } from './blob-service';
import type { StorageService } from './storage-service';

const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  csv: 'text/csv',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

export type ImportOutcome =
  { ok: true; workspace: Workspace; warnings: string[] } | { ok: false; error: string };

/**
 * Whole-workspace export/import against the live data directory. Blob bytes
 * travel inside the JSON as data URLs (prototype-compatible).
 */
export class ImportExportService {
  constructor(
    private readonly storage: StorageService,
    private readonly blobs: BlobService,
  ) {}

  /** Serialize the flushed on-disk workspace (plus blobs) to `targetPath`. */
  async exportTo(targetPath: string): Promise<{ ok: boolean; error?: string }> {
    await this.storage.flushAll();
    const { workspace } = await this.storage.loadWorkspace();
    if (workspace === null) return { ok: false, error: 'Nothing to export yet' };

    const blobMap: Record<string, string> = {};
    for (const file of workspace.files) {
      if (file.kind !== 'file') continue;
      const path = this.blobs.find(file.id);
      if (path === null) continue;
      const bytes = await readFile(path);
      const mime =
        file.mime !== '' ? file.mime : (EXT_MIME[file.ext] ?? 'application/octet-stream');
      blobMap[file.id] = `data:${mime};base64,${bytes.toString('base64')}`;
    }

    await writeFile(
      targetPath,
      `${JSON.stringify(buildExport(workspace, blobMap), null, 2)}\n`,
      'utf8',
    );
    return { ok: true };
  }

  /** Parse, migrate, persist, and materialize blobs. */
  async importFromText(rawText: string): Promise<ImportOutcome> {
    const parsed = parseImport(rawText, newId);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const { workspace, blobs, warnings } = parsed.value;
    await this.storage.saveWorkspaceNow(workspace);

    for (const [id, dataUrl] of Object.entries(blobs)) {
      const entry = workspace.files.find((f) => f.id === id);
      if (entry === undefined) continue;
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
      await this.blobs.save(id, entry.ext, Buffer.from(base64, 'base64'));
    }

    return { ok: true, workspace, warnings };
  }

  async importFromFile(path: string): Promise<ImportOutcome> {
    try {
      return await this.importFromText(await readFile(path, 'utf8'));
    } catch {
      return { ok: false, error: 'Could not read the selected file' };
    }
  }
}
