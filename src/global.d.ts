export {};

import type { KioskApi } from './services/kioskApi';

declare global {
  interface Window {
    kiosk: KioskApi;
  }
}
