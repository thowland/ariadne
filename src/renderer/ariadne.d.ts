import type { AriadneApi } from '../preload';

declare global {
  interface Window {
    ariadne: AriadneApi;
  }
}

export {};
