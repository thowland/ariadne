import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Stores uploaded binaries as ordinary files named `<fileId>.<ext>` under
 * <dataDir>/blobs. Bytes flow renderer → IPC → here exactly once (upload);
 * reads go through the ariadne-blob:// protocol, never over IPC.
 */
export class BlobService {
  constructor(private readonly dataDir: string) {}

  get blobsDir(): string {
    return join(this.dataDir, 'blobs');
  }

  /** Absolute path of the stored blob for `fileId`, or null. */
  find(fileId: string): string | null {
    if (!existsSync(this.blobsDir)) return null;
    // Ids are UUIDs — safe as filename prefixes; refuse anything path-like.
    if (!/^[\w-]+$/.test(fileId)) return null;
    const match = readdirSync(this.blobsDir).find(
      (f) => f === fileId || f.startsWith(`${fileId}.`),
    );
    return match === undefined ? null : join(this.blobsDir, match);
  }

  async save(fileId: string, ext: string, bytes: Uint8Array): Promise<{ size: number }> {
    if (!/^[\w-]+$/.test(fileId)) throw new Error(`invalid blob id: ${fileId}`);
    mkdirSync(this.blobsDir, { recursive: true });
    const safeExt = /^[a-z0-9]{1,8}$/i.test(ext) ? `.${ext.toLowerCase()}` : '';
    // Replace any previous bytes for this id (re-upload).
    await this.delete(fileId);
    await writeFile(join(this.blobsDir, `${fileId}${safeExt}`), bytes);
    return { size: bytes.byteLength };
  }

  async delete(fileId: string): Promise<void> {
    const existing = this.find(fileId);
    if (existing !== null) await rm(existing, { force: true });
  }

  async deleteMany(fileIds: readonly string[]): Promise<void> {
    await Promise.all(fileIds.map((id) => this.delete(id)));
  }
}
