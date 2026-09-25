import { _electron as electron, expect, test } from '@playwright/test';

test('boots Electron with only the typed preload boundary exposed', async () => {
  const electronApp = await electron.launch({ args: ['.'] });

  try {
    const window = await electronApp.firstWindow();

    await expect(window.getByRole('heading', { name: 'HIGHEST Kiosk' })).toBeVisible();
    await expect(window.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
      'content',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'",
    );

    const exposedGlobals = await window.evaluate(() => {
      const browserGlobal = globalThis as typeof globalThis & {
        kiosk: object;
        process?: unknown;
        require?: unknown;
      };

      return {
        kioskKeys: Object.keys(browserGlobal.kiosk),
        nodeProcess: typeof browserGlobal.process,
        nodeRequire: typeof browserGlobal.require,
      };
    });

    expect(exposedGlobals).toEqual({
      kioskKeys: [],
      nodeProcess: 'undefined',
      nodeRequire: 'undefined',
    });
  } finally {
    await electronApp.close();
  }
});
