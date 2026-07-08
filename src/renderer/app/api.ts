import type { AriadneApi } from '@shared/ipc-contract';

/**
 * Accessor for the preload bridge. Indirection exists so tests can install a
 * mock `window.ariadne` before the store loads.
 */
export function getApi(): AriadneApi {
  return window.ariadne;
}
