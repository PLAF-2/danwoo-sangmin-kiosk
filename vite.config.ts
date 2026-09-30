import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

import { localApi } from './scripts/local-api';

// Build only: the dev server injects CSS through inline <style> tags, which this policy blocks.
const contentSecurityPolicy: Plugin = {
  name: 'web-content-security-policy',
  apply: 'build',
  transformIndexHtml: {
    order: 'pre',
    handler: (html) => ({ html, tags: [{
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
  plugins: [contentSecurityPolicy, react(), localApi()],
  publicDir: 'data/defaults',
  build: { outDir: 'dist' },
});
