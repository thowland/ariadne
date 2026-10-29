/**
 * Entity id generation. Mutations receive `newId` through their context
 * argument so tests can inject deterministic ids; this is the default source.
 */

/**
 * The slice of WebCrypto used here. Node >=18 and every browser provide a
 * global `crypto`, but @types/node@18 does not declare it; this covers both
 * tsconfig projects without pulling in node:crypto (unbundleable in the
 * renderer).
 */
interface IdCrypto {
  randomUUID?: () => string;
  getRandomValues: <T extends Uint8Array>(array: T) => T;
}
declare const crypto: IdCrypto;

/**
 * A version-4 UUID from `getRandomValues`, for when `randomUUID` is missing.
 * Browsers only provide `randomUUID` on secure pages (HTTPS or localhost), so
 * the web build (D55) opened at a plain-HTTP host name has no `randomUUID` —
 * but `getRandomValues` exists everywhere, with the same randomness.
 */
export function uuidFromRandomBytes(source: IdCrypto): string {
  const b = source.getRandomValues(new Uint8Array(16));
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40; // version 4
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function newId(source: IdCrypto = crypto): string {
  return typeof source.randomUUID === 'function'
    ? source.randomUUID()
    : uuidFromRandomBytes(source);
}
