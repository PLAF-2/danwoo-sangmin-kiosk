// @vitest-environment node
import { scryptSync } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import catalog from '../../api/admin/catalog';
import settings from '../../api/admin/settings';
import payment from '../../api/admin/payment';
import password from '../../api/admin/password';
import type { ApiResponse } from '../../api/_lib/http';
import defaultCatalog from '../../data/defaults/catalog.json';
import defaultSettings from '../../data/defaults/settings.json';
import defaultPayment from '../../data/defaults/payment.json';

const { query, transaction } = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock('../../api/_lib/db', () => ({ getDb: () => ({ query, transaction }) }));
const cookie = '__Host-kiosk-admin=824b1722-4a18-4d69-9b51-dccac58dc700';
const salt = '0123456789abcdef0123456789abcdef';
const credential = { algorithm: 'scrypt', salt, hash: scryptSync('admin0000', Buffer.from(salt, 'hex'), 64).toString('hex') };
function response() {
  return { statusCode: 200, setHeader: vi.fn(), end: vi.fn() } as unknown as ApiResponse;
}
beforeEach(() => {
  query.mockReset().mockImplementation((sql: string) => Promise.resolve(sql.includes('SELECT expires_at') ? [{ expires_at: new Date(Date.now() + 300000) }] : sql.includes('SELECT algorithm') ? [credential] : sql.includes('UPDATE admin_credentials') ? [{ id: 1 }] : []));
  transaction.mockReset().mockImplementation((queries: Promise<unknown>[]) => Promise.all(queries));
});

describe('protected admin writes', () => {
  it.each([catalog, settings, payment, password])('rejects unauthenticated writes before touching storage', async (handler) => {
    const res = response();
    await handler({ method: 'POST', headers: {}, body: {} }, res);
    expect(res.statusCode).toBe(401);
    expect(query).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each([catalog, settings, payment, password])('rejects expired sessions', async (handler) => {
    query.mockResolvedValue([]);
    const res = response();
    await handler({ method: 'POST', headers: { cookie }, body: {} }, res);
    expect(res.statusCode).toBe(401);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('replaces the complete catalog and ordered detail images in one transaction', async () => {
    const res = response();
    await catalog({ method: 'POST', headers: { cookie }, body: defaultCatalog }, res);
    expect(res.statusCode).toBe(200);
    expect(transaction).toHaveBeenCalledTimes(1);
    const writes = query.mock.calls.slice(1);
    expect(writes[0]?.[0]).toContain('LOCK TABLE');
    expect(writes[1]?.[0]).toContain('DELETE FROM products');
    expect(writes[2]?.[0]).toContain('DELETE FROM categories');
    expect(writes.filter(([sql]) => sql.includes('INSERT INTO categories'))).toHaveLength(defaultCatalog.categories.length);
    expect(writes.filter(([sql]) => sql.includes('INSERT INTO products'))).toHaveLength(defaultCatalog.products.length);
    expect(writes.filter(([sql]) => sql.includes('INSERT INTO product_detail_images'))).toHaveLength(defaultCatalog.products.reduce((sum, product) => sum + product.detailImages.length, 0));
    expect(transaction.mock.calls[0]?.[0]).toHaveLength(writes.length);
  });

  it.each([
    { ...defaultCatalog, categories: [] },
    { ...defaultCatalog, products: [...defaultCatalog.products, defaultCatalog.products[0]] },
  ])('rejects invalid catalog references or duplicate identities before writing', async (body) => {
    const res = response();
    await catalog({ method: 'POST', headers: { cookie }, body }, res);
    expect(res.statusCode).toBe(400);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it.each([[settings, defaultSettings, 'app_settings'], [payment, defaultPayment, 'payment_settings']] as const)('saves validated settings', async (handler, body, table) => {
    const res = response();
    await handler({ method: 'POST', headers: { cookie }, body }, res);
    expect(res.statusCode).toBe(200);
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining(`INSERT INTO ${table}`), [JSON.stringify(body)]);
  });

  it.each([catalog, settings, payment, password])('rejects malformed bodies without writes', async (handler) => {
    const res = response();
    await handler({ method: 'POST', headers: { cookie }, body: { unexpected: true } }, res);
    expect(res.statusCode).toBe(400);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('verifies the current password, saves a fresh scrypt credential and revokes every session atomically', async () => {
    const res = response();
    await password({ method: 'POST', headers: { cookie }, body: { currentPassword: 'admin0000', nextPassword: 'new-password' } }, res);
    expect(res.statusCode).toBe(200);
    const update = query.mock.calls.find(([sql]) => sql.includes('UPDATE admin_credentials'))!;
    const [nextSalt, hash] = update[1] as string[];
    expect(nextSalt).not.toBe(salt);
    expect(hash).toBe(scryptSync('new-password', Buffer.from(nextSalt!, 'hex'), 64).toString('hex'));
    expect(update[0]).toContain('DELETE FROM admin_sessions');
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(res.setHeader).toHaveBeenCalledWith('Set-Cookie', expect.stringContaining('Max-Age=0'));
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO admin_sessions'))).toBe(false);
    expect(query.mock.calls[2]?.[0]).toContain('SELECT id FROM admin_credentials WHERE id = 1 FOR UPDATE');
    expect(transaction).toHaveBeenCalledWith(
      [query.mock.results[2]!.value, query.mock.results[3]!.value],
      { isolationLevel: 'ReadCommitted' },
    );
  });

  it('rejects an incorrect current password without changing credentials or sessions', async () => {
    const res = response();
    await password({ method: 'POST', headers: { cookie }, body: { currentPassword: 'wrong', nextPassword: 'new-password' } }, res);
    expect(res.statusCode).toBe(401);
    expect(transaction).not.toHaveBeenCalled();
  });
});
