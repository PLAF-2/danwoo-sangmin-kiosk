// @vitest-environment node
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import orders from '../../api/orders';
import type { ApiResponse } from '../../api/_lib/http';
import defaultCatalog from '../../data/defaults/catalog.json';
import defaultPayment from '../../data/defaults/payment.json';

const { query, transaction } = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock('../../api/_lib/db', () => ({ getDb: () => ({ query, transaction }) }));
const product = defaultCatalog.products[0]!;
const input = { requestId: '824b1722-4a18-4d69-9b51-dccac58dc700', items: [{ productId: product.id, quantity: 2, capturedUnitPrice: product.price }], expectedPayment: defaultPayment };
const fingerprint = createHash('sha256').update(JSON.stringify({ items: input.items, expectedPayment: input.expectedPayment })).digest('hex');
const order = { orderNumber: 'order-123', items: [{ ...input.items[0], name: product.name, thumbnailImage: product.thumbnailImage }], subtotal: product.price * 2, discount: 0, total: product.price * 2, paymentMode: defaultPayment.mode, status: 'paid', createdAt: '2026-09-28T00:00:00.000Z' };
function response() {
  const res = { statusCode: 200, setHeader: vi.fn(), end: vi.fn() };
  return { res: res as unknown as ApiResponse, result: () => JSON.parse(res.end.mock.calls[0]![0]) };
}
beforeEach(() => { query.mockReset().mockResolvedValue([]); transaction.mockReset().mockResolvedValue([[], [{ request_fingerprint: fingerprint, order }]]); });

describe('order creation', () => {
  it('reads a persisted order snapshot for the completion screen', async () => {
    query.mockResolvedValue([{ order }]);
    const { res, result } = response();
    await orders({ method: 'GET', headers: {}, url: '/api/orders?orderNumber=order-123' }, res);
    expect(res.statusCode).toBe(200);
    expect(result()).toEqual(order);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('order_items'), ['order-123']);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('returns null for an unknown order and rejects missing order numbers', async () => {
    const missing = response();
    await orders({ method: 'GET', headers: {}, url: '/api/orders?orderNumber=missing' }, missing.res);
    expect(missing.res.statusCode).toBe(200);
    expect(missing.result()).toBeNull();
    const invalid = response();
    await orders({ method: 'GET', headers: {}, url: '/api/orders' }, invalid.res);
    expect(invalid.res.statusCode).toBe(400);
  });

  it('returns persisted server snapshots and totals without requiring an admin session', async () => {
    const { res, result } = response();
    await orders({ method: 'POST', headers: {}, body: input }, res);
    expect(res.statusCode).toBe(200);
    expect(result()).toEqual(order);
    expect(transaction).toHaveBeenCalledTimes(1);
    const [sql, values] = query.mock.calls[0]!;
    expect(sql).toContain('p.name');
    expect(sql).toContain('p.thumbnail_image');
    expect(sql).toContain('sum(price::bigint * quantity)');
    expect(sql).toContain('p.price = i."capturedUnitPrice"');
    expect(sql).toContain('p.max_quantity >= i.quantity');
    expect(sql).toContain("p.sale_status = 'onSale'");
    expect(sql).toContain('p.is_visible');
    expect(sql).toContain('data = $4::jsonb');
    expect(sql).toContain('ON CONFLICT (request_id) DO NOTHING');
    expect(sql).toContain('INSERT INTO order_items');
    expect(values).toContain(input.requestId);
    expect(values).toContain(fingerprint);
    expect(query.mock.calls[1]?.[1]).toEqual([input.requestId]);
  });

  it('returns the same order for identical retries', async () => {
    const first = response();
    const second = response();
    await orders({ method: 'POST', headers: {}, body: input }, first.res);
    await orders({ method: 'POST', headers: {}, body: input }, second.res);
    expect(second.res.statusCode).toBe(200);
    expect(second.result()).toEqual(first.result());
  });

  it('conflicts when a request id belongs to different input', async () => {
    transaction.mockResolvedValue([[], [{ request_fingerprint: 'another-payload', order }]]);
    const { res } = response();
    await orders({ method: 'POST', headers: {}, body: input }, res);
    expect(res.statusCode).toBe(409);
  });

  it('requests checkout review if products or payment no longer match', async () => {
    transaction.mockResolvedValue([[], []]);
    const { res, result } = response();
    await orders({ method: 'POST', headers: {}, body: input }, res);
    expect(res.statusCode).toBe(409);
    expect(result().error).toContain('ORDER_REVIEW_REQUIRED');
  });

  it.each([{}, { ...input, requestId: 'bad' }, { ...input, items: [] }, { ...input, items: [input.items[0], input.items[0]] }, { ...input, total: 0 }, { ...input, items: [{ ...input.items[0], quantity: 0 }] }])('rejects malformed or client-controlled order fields', async (body) => {
    const { res } = response();
    await orders({ method: 'POST', headers: {}, body }, res);
    expect(res.statusCode).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('does not expose transaction errors', async () => {
    transaction.mockRejectedValue(new Error('private connection details'));
    const { res, result } = response();
    await orders({ method: 'POST', headers: {}, body: input }, res);
    expect(res.statusCode).toBe(500);
    expect(result()).toEqual({ error: 'Internal server error' });
  });
});
