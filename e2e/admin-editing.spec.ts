import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { chromium, expect, test } from '@playwright/test';

const password = process.env.KIOSK_E2E_ADMIN_PASSWORD;

async function executable() {
  const path = resolve('out', `HIGHEST Kiosk-${process.platform}-${process.arch}`, 'HIGHEST Kiosk.exe');
  await access(path);
  return path;
}

async function pageFor(userData: string) {
  const file = join(userData, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      const [port] = (await readFile(file, 'utf8')).trim().split(/\r?\n/u);
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      const context = browser.contexts()[0];
      await expect.poll(() => context?.pages().length ?? 0).toBeGreaterThan(0);
      const page = context?.pages()[0];
      if (!page) throw new Error('Packaged kiosk did not open a renderer page');
      return { browser, page };
    } catch { await new Promise((done) => setTimeout(done, 100)); }
  }
  throw new Error('Packaged kiosk did not expose a renderer page');
}

async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return;
  child.kill();
  await new Promise((done) => child.once('exit', done));
}

// eslint-disable-next-line no-empty-pattern
test('authenticates and renders the main administrator screens', async ({}, testInfo) => {
  test.skip(!password, 'KIOSK_E2E_ADMIN_PASSWORD is required');
  if (!password) throw new Error('KIOSK_E2E_ADMIN_PASSWORD is required');
  const userData = await mkdtemp(join(tmpdir(), 'highest-admin-e2e-'));
  const app = spawn(await executable(), ['--remote-debugging-port=0', `--user-data-dir=${userData}`], {
    env: { ...process.env, KIOSK_ADMIN_INITIAL_PASSWORD: password },
    windowsHide: true,
  });

  try {
    const { browser, page } = await pageFor(userData);
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
    await browser.close();
  } finally {
    await stop(app);
    await rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
