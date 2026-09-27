import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

const password = process.env.KIOSK_E2E_ADMIN_PASSWORD;

// eslint-disable-next-line no-empty-pattern
test('authenticates and renders the main administrator screens', async ({}, testInfo) => {
  test.skip(!password, 'KIOSK_E2E_ADMIN_PASSWORD is required');
  if (!password) throw new Error('KIOSK_E2E_ADMIN_PASSWORD is required');
  const userData = await mkdtemp(join(tmpdir(), 'highest-admin-e2e-'));
  const electronApp = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    env: { ...process.env, KIOSK_ADMIN_INITIAL_PASSWORD: password },
  });

  try {
    const page = await electronApp.firstWindow();
    await page.evaluate("location.hash = '#/admin/login'");
    await expect(page.getByRole('heading', { name: '관리자 로그인' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('admin-login.png'), fullPage: true });

    await page.getByLabel('비밀번호').fill(password);
    await page.getByRole('button', { name: '로그인' }).click();
    await expect(page.getByRole('heading', { name: '상품 관리' })).toBeVisible();
    await expect(page.getByText('HORIZON Album')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('admin-products.png'), fullPage: true });

    for (const [link, heading, screenshot] of [
      ['카테고리', '카테고리 관리', 'admin-categories.png'],
      ['웰컴', '웰컴 화면 관리', 'admin-welcome.png'],
      ['결제', '결제 설정', 'admin-payment.png'],
      ['시스템', '시스템 관리', 'admin-system.png'],
    ] as const) {
      await page.getByRole('link', { name: link }).click();
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(screenshot), fullPage: true });
    }
  } finally {
    await electronApp.close();
    await rm(userData, { recursive: true, force: true });
  }
});
