import eslint from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['.vite', 'out', 'node_modules', 'coverage', 'playwright-report', 'test-results'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: [
      'src/main.ts',
      'src/preload.ts',
      'electron/**/*.ts',
      '*.config.ts',
      'e2e/**/*.ts',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        MAIN_WINDOW_VITE_DEV_SERVER_URL: 'readonly',
        MAIN_WINDOW_VITE_NAME: 'readonly',
      },
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}', 'src/test/**/*.ts', 'src/global.d.ts'],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
);
