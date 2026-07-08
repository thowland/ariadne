/**
 * Entity id generation. Mutations receive `newId` through their context
 * argument so tests can inject deterministic ids; this is the default source.
 */
// Node >=18 and Chromium both provide global WebCrypto at runtime, but
// @types/node@18 does not declare it; this module-scoped declaration covers
// both tsconfig projects without pulling in node:crypto (unbundleable in the
// renderer).
declare const crypto: { randomUUID: () => string };

export function newId(): string {
  return crypto.randomUUID();
}
