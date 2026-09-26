import { expect, test } from '@playwright/test';

test('loads the kiosk renderer entry', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('HIGHEST Kiosk');
  await expect(page.getByRole('heading', { name: 'HIGHEST Kiosk' })).toBeVisible();
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
    'content',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: kiosk-media:; font-src 'self'; connect-src 'self' ws://127.0.0.1:5173; object-src 'none'; base-uri 'none'; form-action 'none'",
  );
});
