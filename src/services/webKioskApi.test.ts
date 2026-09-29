import { describe, expect, it, vi } from 'vitest';

import { createAppSettings, createCatalogData, createOrder, createPaymentSettings } from '../test/fixtures';
import { createWebKioskApi } from './webKioskApi';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('browser kiosk API', () => {
  it('reads public data and persisted orders from same-origin endpoints with cookies', async () => {
    const catalog = createCatalogData();
    const settings = createAppSettings();
    const payment = createPaymentSettings();
    const order = createOrder();
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json(catalog)).mockResolvedValueOnce(json(settings))
      .mockResolvedValueOnce(json(payment)).mockResolvedValueOnce(json(order)).mockResolvedValueOnce(json(null));
    const api = createWebKioskApi(fetcher);
    expect(await api.catalog.read()).toEqual(catalog);
    expect(await api.settings.read()).toEqual(settings);
    expect(await api.settings.readPayment()).toEqual(payment);
    expect(await api.orders.read('order / 123')).toEqual(order);
    expect(await api.orders.read('missing')).toBeNull();
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      '/api/catalog', '/api/settings', '/api/payment', '/api/orders?orderNumber=order%20%2F%20123', '/api/orders?orderNumber=missing',
    ]);
    for (const [, options] of fetcher.mock.calls) expect(options).toMatchObject({ credentials: 'include' });
  });

  it('sends catalog/settings/payment writes and order requests using actual JSON contracts', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => json({ ok: true }));
    const api = createWebKioskApi(fetcher);
    const catalog = createCatalogData();
    const settings = createAppSettings();
    const payment = createPaymentSettings();
    await api.catalog.save(catalog);
    await api.settings.save(settings);
    await api.settings.savePayment(payment);
    const input = { requestId: crypto.randomUUID(), items: [{ productId: 'album', quantity: 1, capturedUnitPrice: 12000 }], expectedPayment: payment };
    const order = createOrder();
    fetcher.mockResolvedValueOnce(json(order));
    expect(await api.orders.create(input)).toEqual(order);
    for (const [index, [path, body]] of [
      ['/api/admin/catalog', catalog], ['/api/admin/settings', settings], ['/api/admin/payment', payment], ['/api/orders', input],
    ].entries()) {
      expect(fetcher).toHaveBeenNthCalledWith(index + 1, path, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
    }
  });

  it('maps cookie login success and invalid credentials without swallowing server failures', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ ok: true }))
      .mockResolvedValueOnce(json({ error: 'Invalid password' }, 401))
      .mockResolvedValueOnce(json({ error: 'Internal server error' }, 500));
    const api = createWebKioskApi(fetcher);
    expect(await api.admin.authenticate('correct')).toBe(true);
    expect(await api.admin.authenticate('incorrect')).toBe(false);
    await expect(api.admin.authenticate('retry')).rejects.toThrow('Internal server error');
    expect(fetcher).toHaveBeenNthCalledWith(1, '/api/admin/login', expect.objectContaining({ credentials: 'include', body: '{"password":"correct"}' }));
  });

  it('keeps, closes, and changes the cookie session with JSON bodies', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => json({ ok: true }));
    const api = createWebKioskApi(fetcher);
    await api.admin.keepAlive();
    await api.admin.logout();
    await api.admin.changePassword('current', 'replacement');
    expect(fetcher.mock.calls.map(([url, options]) => [url, options?.body])).toEqual([
      ['/api/admin/keep-alive', '{}'], ['/api/admin/logout', '{}'],
      ['/api/admin/password', '{"currentPassword":"current","nextPassword":"replacement"}'],
    ]);
  });

  it('uploads a File in multipart form data and returns the hosted URL', async () => {
    const url = 'https://example.public.blob.vercel-storage.com/image.png';
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ url }));
    const file = new File(['image'], 'image.png', { type: 'image/png' });
    expect(await createWebKioskApi(fetcher).media.upload!(file)).toBe(url);
    const [path, options] = fetcher.mock.calls[0]!;
    expect(path).toBe('/api/admin/media');
    expect(options).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(options?.headers).toBeUndefined();
    expect((options?.body as FormData).get('file')).toBe(file);
  });

  it('propagates order review and upload authorization errors', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ error: 'ORDER_REVIEW_REQUIRED: changed' }, 409))
      .mockResolvedValueOnce(json({ error: 'Authentication required' }, 401));
    const api = createWebKioskApi(fetcher);
    await expect(api.orders.create({ requestId: crypto.randomUUID(), items: [], expectedPayment: createPaymentSettings() })).rejects.toThrow('ORDER_REVIEW_REQUIRED');
    await expect(api.media.upload!(new File([], 'image.png'))).rejects.toThrow('Authentication required');
  });
});
