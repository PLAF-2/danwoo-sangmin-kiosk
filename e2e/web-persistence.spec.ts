import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import type { CatalogData, Order, PaymentSettings } from '../src/domain/contracts';

const baseURL = process.env.WEB_E2E_BASE_URL;
const password = process.env.WEB_E2E_ADMIN_PASSWORD;

test.skip(!baseURL || !password, 'Set WEB_E2E_BASE_URL and WEB_E2E_ADMIN_PASSWORD for an isolated test runtime');

test('persists an admin product image across reloads and deduplicates order retries', async ({ page, browser }) => {
  if (!baseURL || !password) return;

  const name = `Web E2E ${randomUUID()}`;
  await page.goto('/admin/login');
  await page.getByLabel('비밀번호').fill(password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByRole('heading', { name: '상품 관리' })).toBeVisible();

  try {
    await page.getByRole('button', { name: '상품 추가', exact: true }).click();
    await page.getByLabel('상품명', { exact: true }).fill(name);
    await page.getByLabel('가격', { exact: true }).fill('1200');
    const upload = page.waitForResponse((response) => response.url().endsWith('/api/admin/media') && response.request().method() === 'POST');
    await page.getByLabel('대표 이미지 선택').setInputFiles({
      name: 'persistence.png',
      mimeType: 'image/png',
      buffer: await sharp({ create: { width: 32, height: 32, channels: 3, background: '#427bad' } }).png().toBuffer(),
    });
    const uploaded = await upload;
    expect(uploaded.ok()).toBe(true);
    const { url: imageUrl } = await uploaded.json() as { url: string };
    expect(imageUrl).toMatch(/^https:\/\//u);
    await expect(page.getByText(imageUrl, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '상품 저장', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('상품을 저장했습니다.');

    const customer = await browser.newContext({ baseURL });
    try {
      const catalogPage = await customer.newPage();
      await catalogPage.goto('/shop');
      await catalogPage.reload();
      const image = catalogPage.getByRole('img', { name, exact: true });
      await expect(image).toHaveAttribute('src', imageUrl);
      await expect.poll(() => image.evaluate('(element) => element.naturalWidth')).toBeGreaterThan(0);

      const catalogResponse = await customer.request.get('/api/catalog');
      expect(catalogResponse.ok()).toBe(true);
      const catalog = await catalogResponse.json() as CatalogData;
      const product = catalog.products.find((item) => item.name === name);
      expect(product?.thumbnailImage).toBe(imageUrl);
      if (!product) throw new Error('Saved product missing from the persisted catalog');
      const paymentResponse = await customer.request.get('/api/payment');
      expect(paymentResponse.ok()).toBe(true);
      const expectedPayment = await paymentResponse.json() as PaymentSettings;
      const data = {
        requestId: randomUUID(),
        items: [{ productId: product.id, quantity: 1, capturedUnitPrice: product.price }],
        expectedPayment,
      };
      const responses = await Promise.all([
        customer.request.post('/api/orders', { data }),
        customer.request.post('/api/orders', { data }),
      ]);
      for (const response of responses) expect(response.ok()).toBe(true);
      const [first, retry] = await Promise.all(responses.map(async (response) => await response.json() as Order));
      expect(retry).toEqual(first);
      expect(first?.total).toBe(1200);
      const persisted = await customer.request.get(`/api/orders?orderNumber=${encodeURIComponent(first!.orderNumber)}`);
      expect(persisted.ok()).toBe(true);
      expect(await persisted.json()).toEqual(first);
      const conflict = await customer.request.post('/api/orders', {
        data: { ...data, items: [{ ...data.items[0], capturedUnitPrice: product.price + 1 }] },
      });
      expect(conflict.status()).toBe(409);
    } finally {
      await customer.close();
    }
  } finally {
    // Remove only this run's product; orders and uploaded Blob remain in the test environment.
    const response = await page.request.get('/api/catalog');
    expect(response.ok()).toBe(true);
    const catalog = await response.json() as CatalogData;
    if (catalog.products.some((product) => product.name === name)) {
      const cleanup = await page.request.post('/api/admin/catalog', {
        data: { ...catalog, products: catalog.products.filter((product) => product.name !== name) },
      });
      expect(cleanup.ok()).toBe(true);
    }
  }
});
