export {};

import type { KioskApi } from './services/kioskApi';

declare global {
  interface Window {
    // Component tests inject a stub here; the app passes its API through KioskApiContext.
    kiosk: KioskApi;
  }
}
