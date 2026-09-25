import { expect, test } from '@playwright/test';

test('loads the kiosk renderer entry', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('HIGHEST Kiosk');
  await expect(page.getByRole('heading', { name: 'HIGHEST Kiosk' })).toBeVisible();
});
