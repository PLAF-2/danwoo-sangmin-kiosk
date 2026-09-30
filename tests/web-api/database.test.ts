// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

import catalogHandler from '../../api/catalog';
import orders from '../../api/orders';
import { replaceCatalog } from '../../api/_lib/catalogWrite';
import { localDatabaseKey, type Database } from '../../api/_lib/db';
import type { ApiRequest, ApiResponse } from '../../api/_lib/http';
import { seedDatabase } from '../../api/_lib/seed';
import defaultPayment from '../../data/defaults/payment.json';
import { createPgliteDatabase } from '../../scripts/local-api';
import type { CatalogData } from '../../src/domain';

// Runs the real SQL against an in-memory Postgres; the other API tests mock the driver.
let db: Database;

async function call(handler: (request: ApiRequest, response: ApiResponse) => Promise<void>, request: ApiRequest) {
  let body = '';
  const response = { statusCode: 200, setHeader: () => response, end: (chunk: string) => { body = chunk; } };
  await handler(request, response as unknown as ApiResponse);
  return { status: response.statusCode, body: JSON.parse(body) };
}

const readCatalog = async () => (await call(catalogHandler, { method: 'GET', headers: {}, url: '/api/catalog' })).body as CatalogData;
let requestNumber = 0;
const order = (items: unknown[]) => call(orders, {
  method: 'POST',
  headers: {},
  body: { requestId: `00000000-0000-4000-8000-${String(++requestNumber).padStart(12, '0')}`, items, expectedPayment: defaultPayment },
});
const doll = (value: string, quantity = 1) => ({
  productId: 'set-graduation-package', quantity, capturedUnitPrice: 60000, selectedOptions: [{ name: '인형', value }],
});

beforeAll(async () => {
  const pg = new PGlite();
  await pg.exec(await readFile('api/schema.sql', 'utf8'));
  db = createPgliteDatabase(pg);
  (globalThis as { [localDatabaseKey]?: Database })[localDatabaseKey] = db;
  await seedDatabase(db);
}, 30_000);

describe('database-backed API', () => {
  it('returns product options only for products that have them', async () => {
    const { products } = await readCatalog();
    expect(products.find(({ id }) => id === 'set-graduation-package')?.options).toEqual([{ name: '인형', values: ['단우', '상민'] }]);
    expect(products.find(({ id }) => id === 'set-class-h02')).not.toHaveProperty('options');
  });

  it('stores each option line and reads the order back with its choices', async () => {
    const created = await order([doll('단우'), doll('상민'), { productId: 'set-class-h02', quantity: 1, capturedUnitPrice: 32000 }]);
    expect(created.status).toBe(200);
    expect(created.body.total).toBe(152000);

    const read = await call(orders, { method: 'GET', headers: {}, url: `/api/orders?orderNumber=${created.body.orderNumber}` });
    expect(read.body.items.map(({ selectedOptions }: { selectedOptions?: unknown }) => selectedOptions)).toEqual([
      [{ name: '인형', value: '단우' }], [{ name: '인형', value: '상민' }], undefined,
    ]);
  });

  it.each([
    ['a missing choice', [{ productId: 'set-graduation-package', quantity: 1, capturedUnitPrice: 60000 }]],
    ['an unknown value', [doll('하이')]],
    ['a renamed option', [{ ...doll('단우'), selectedOptions: [{ name: '멤버', value: '단우' }] }]],
    ['options on a product without them', [{ productId: 'set-class-h02', quantity: 1, capturedUnitPrice: 32000, selectedOptions: [{ name: '인형', value: '단우' }] }]],
    ['a product total above its maximum', [doll('단우', 2), doll('상민', 1)]],
  ])('asks for checkout review for %s', async (_label, items) => {
    const result = await order(items);
    expect(result.status).toBe(409);
    expect(result.body.error).toContain('ORDER_REVIEW_REQUIRED');
  });

  it('replaces the catalog including options', async () => {
    const catalog = await readCatalog();
    const products = catalog.products.map((product) => product.id === 'doll-uniform-set'
      ? { ...product, options: [{ name: '사이즈', values: ['S', 'M'] }] }
      : product);
    await replaceCatalog(db, { ...catalog, products });

    const saved = (await readCatalog()).products.find(({ id }) => id === 'doll-uniform-set');
    expect(saved?.options).toEqual([{ name: '사이즈', values: ['S', 'M'] }]);
  });
});
