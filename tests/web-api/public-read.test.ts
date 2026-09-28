// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import catalog from '../../api/catalog';
import settings from '../../api/settings';
import payment from '../../api/payment';
import type { ApiResponse } from '../../api/_lib/http';
import defaultCatalog from '../../data/defaults/catalog.json';
import defaultSettings from '../../data/defaults/settings.json';
import defaultPayment from '../../data/defaults/payment.json';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../api/_lib/db', () => ({ getDb: () => ({ query }) }));
function response() {
  const headers = new Map<string, string>();
  const res = { statusCode: 200, setHeader: (name: string, value: string) => { headers.set(name, value); }, end: vi.fn() };
  return { res: res as unknown as ApiResponse, headers, end: res.end };
}
beforeEach(() => query.mockReset());

describe('public reads', () => {
  it('returns categories, product details and ISO timestamps in the existing contract', async () => {
    query.mockResolvedValueOnce(defaultCatalog.categories).mockResolvedValueOnce(defaultCatalog.products.map((product) => ({ ...product, createdAt: new Date(product.createdAt), updatedAt: new Date(product.updatedAt) })));
    const { res, headers, end } = response();
    await catalog({ method: 'GET', headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(end.mock.calls[0]![0])).toEqual(defaultCatalog);
    expect(headers.get('Cache-Control')).toBe('no-store');
  });

  it.each([[settings, defaultSettings], [payment, defaultPayment]] as const)('returns settings without authentication and disables caching', async (handler, expected) => {
    query.mockResolvedValue([{ data: expected }]);
    const { res, headers, end } = response();
    await handler({ method: 'GET', headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(end.mock.calls[0]![0])).toEqual(expected);
    expect(headers.get('Cache-Control')).toBe('no-store');
    expect(headers.get('Content-Type')).toBe('application/json; charset=utf-8');
  });

  it.each([catalog, settings, payment])('rejects unsupported writes', async (handler) => {
    const { res, headers } = response();
    await handler({ method: 'POST', headers: {}, body: {} }, res);
    expect(res.statusCode).toBe(405);
    expect(headers.get('Allow')).toBe('GET');
    expect(query).not.toHaveBeenCalled();
  });

  it.each([catalog, settings, payment])('does not send malformed database data to clients', async (handler) => {
    query.mockResolvedValue([{ data: { invalid: true } }]);
    const { res, end } = response();
    await handler({ method: 'GET', headers: {} }, res);
    expect(res.statusCode).toBe(500);
    expect(end).toHaveBeenCalledWith(JSON.stringify({ error: 'Internal server error' }));
  });
});
