import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'web-persistence.spec.ts',
  outputDir: './test-results/web',
  reporter: 'list',
  workers: 1,
  retries: 0,
  timeout: 60_000,
  use: {
    baseURL: process.env.WEB_E2E_BASE_URL ?? 'http://localhost:3000',
    browserName: 'chromium',
    // Login requests contain the test password; do not record traces.
    trace: 'off',
  },
});
