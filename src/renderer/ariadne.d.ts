import type { AriadneApi } from '@shared/ipc-contract';

declare global {
  interface Window {
    ariadne: AriadneApi;
  }
}

export {};
