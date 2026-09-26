import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const productionPolicy =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: kiosk-media:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";
const developmentPolicy =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: kiosk-media:; font-src 'self'; connect-src 'self' ws://127.0.0.1:5173; object-src 'none'; base-uri 'none'; form-action 'none'";

const contentSecurityPolicy = (policy: string): Plugin => ({
  name: 'content-security-policy',
  transformIndexHtml: {
    order: 'pre',
    handler: () => [
      {
        tag: 'meta',
        attrs: {
          'http-equiv': 'Content-Security-Policy',
          content: policy,
        },
        injectTo: 'head-prepend',
      },
    ],
  },
});

export default defineConfig(({ command }) => ({
  plugins: [contentSecurityPolicy(command === 'serve' ? developmentPolicy : productionPolicy), react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
}));
