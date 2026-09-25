export {};

declare global {
  interface Window {
    kiosk: Readonly<Record<string, never>>;
  }
}
