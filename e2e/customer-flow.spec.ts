import { expect, test, chromium } from '@playwright/test';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';

async function executable() {
  const path = resolve('out', `HIGHEST Kiosk-${process.platform}-${process.arch}`, 'HIGHEST Kiosk.exe');
  await access(path);
  return path;
}

async function devToolsPort(userData: string) {
  const file = join(userData, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try { return (await readFile(file, 'utf8')).trim().split(/\r?\n/u)[0]; } catch { await new Promise((done) => setTimeout(done, 100)); }
  }
  throw new Error('Packaged kiosk did not expose a DevTools port');
}

async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return;
  child.kill();
  await new Promise((done) => child.once('exit', done));
}

test('completes an instant customer order without duplicate items or orders', async ({}, testInfo) => {
  const userData = await mkdtemp(join(tmpdir(), 'highest-customer-e2e-'));
  const app = spawn(await executable(), ['--remote-debugging-port=0', `--user-data-dir=${userData}`], { windowsHide: true });

  try {
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${await devToolsPort(userData)}`);
    const context = browser.contexts()[0];
    await expect.poll(() => context?.pages().length ?? 0).toBeGreaterThan(0);
    const page = context?.pages()[0];
    if (!page) throw new Error('Packaged kiosk did not open a renderer page');
    await page.getByRole('button', { name: '굿즈 사러가기' }).click();
    await expect(page.getByRole('heading', { name: '내가 담은 굿즈' })).toBeVisible();

    const addAlbum = page.getByTestId('product-card-horizon-album').getByRole('button', { name: 'HORIZON Album 담기' });
    await addAlbum.dblclick();
    await expect(page.getByRole('region', { name: '내가 담은 굿즈' })).toContainText('총 2개');
    await page.getByRole('button', { name: 'HORIZON Album 수량 줄이기' }).click();
    await expect(page.getByRole('region', { name: '내가 담은 굿즈' })).toContainText('총 1개');

    await page.getByRole('button', { name: '구매하러 가기' }).click();
    await expect(page.getByRole('heading', { name: '주문 내용을 확인해 주세요' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('customer-checkout-720x1280.png'), fullPage: true });
    await page.getByRole('button', { name: '결제하기' }).click();
    await expect(page.getByRole('heading', { name: '결제가 완료되었습니다' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('region', { name: '주문 정보' })).toContainText(/\d{8}-/);
    await browser.close();
  } finally {
    await stop(app);
    await rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
