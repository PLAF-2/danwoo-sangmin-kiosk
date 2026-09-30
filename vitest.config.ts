import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'api/**/*.test.ts', 'tests/web-api/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
  },
});
