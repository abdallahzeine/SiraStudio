import type { CVMakerExternalAPI } from './api';

declare global {
  interface Window {
    cvMaker?: CVMakerExternalAPI;
  }
}

export {};
