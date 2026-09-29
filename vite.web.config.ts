import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const contentSecurityPolicy: Plugin = {
  name: 'web-content-security-policy',
  transformIndexHtml: {
    order: 'pre',
    handler: (html) => ({ html: html.replace('/src/renderer/main.tsx', '/src/renderer/web.tsx'), tags: [{
      tag: 'meta',
      attrs: {
        'http-equiv': 'Content-Security-Policy',
        content: "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'",
      },
      injectTo: 'head-prepend',
    }] }),
  },
};

export default defineConfig({
  plugins: [contentSecurityPolicy, react()],
  publicDir: 'data/defaults',
  build: { outDir: 'dist' },
});
