import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  reporter: 'html',
  use: { trace: 'on-first-retry' },
});
