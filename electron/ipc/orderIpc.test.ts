import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createCatalogData, createOrderInput, createProduct } from '../../src/test/fixtures';
import { createAtomicJsonStore } from '../storage/atomicJsonStore';
import { registerOrderIpc } from './orderIpc';
import { catalogDataSchema } from './schemas';
import { createTestIpcMain } from './testHelpers';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function setup(catalog = createCatalogData()) {
  const directory = await mkdtemp(join(tmpdir(), 'highest-orders-'));
  directories.push(directory);
  const catalogFile = join(directory, 'catalog.json');
  const ordersDirectory = join(directory, 'orders');
  await createAtomicJsonStore({ filePath: catalogFile, schema: catalogDataSchema }).write(catalog);
  const ipcMain = createTestIpcMain();
  let sequence = 0;
  registerOrderIpc({
    ipcMain,
    catalogFile,
    ordersDirectory,
    createOrderNumber: () => `ORDER-${++sequence}`,
    now: () => new Date('2026-09-26T00:00:00.000Z'),
  });
  return ipcMain;
}

describe('order IPC', () => {
  it('recalculates current prices, persists the order, and reads it back', async () => {
    const ipcMain = await setup();

    const order = await ipcMain.invoke(
      'orders:create',
      createOrderInput({
        items: [{ productId: 'horizon-album', quantity: 2, capturedUnitPrice: 1 }],
      }),
    );

    expect(order).toMatchObject({
      orderNumber: 'ORDER-1',
      subtotal: 50000,
      discount: 0,
      total: 50000,
      items: [{ productId: 'horizon-album', quantity: 2, capturedUnitPrice: 25000 }],
    });
    await expect(ipcMain.invoke('orders:read', 'ORDER-1')).resolves.toEqual(order);
    await expect(ipcMain.invoke('orders:read', 'missing')).resolves.toBeNull();
  });

  it.each([
    ['empty cart', createOrderInput({ items: [] })],
    ['unknown product', createOrderInput({ items: [{ productId: 'missing', quantity: 1, capturedUnitPrice: 1 }] })],
    ['too many', createOrderInput({ items: [{ productId: 'horizon-album', quantity: 6, capturedUnitPrice: 25000 }] })],
    ['extra field', { ...createOrderInput(), idempotencyKey: 'invented' }],
  ])('rejects %s', async (_label, input) => {
    const ipcMain = await setup();
    await expect(ipcMain.invoke('orders:create', input)).rejects.toThrow();
  });

  it.each([
    ['sold out', createProduct({ saleStatus: 'soldOut' })],
    ['hidden', createProduct({ isVisible: false })],
  ])('rejects a %s product', async (_label, product) => {
    const ipcMain = await setup(createCatalogData({ products: [product] }));
    await expect(ipcMain.invoke('orders:create', createOrderInput())).rejects.toThrow();
  });

  it('serializes calls and creates a distinct persisted order per one-call request', async () => {
    const ipcMain = await setup();

    const [first, second] = await Promise.all([
      ipcMain.invoke('orders:create', createOrderInput()),
      ipcMain.invoke('orders:create', createOrderInput()),
    ]);

    expect([first, second].map((order) => (order as { orderNumber: string }).orderNumber)).toEqual([
      'ORDER-1',
      'ORDER-2',
    ]);
    await expect(ipcMain.invoke('orders:read', 'ORDER-1')).resolves.toEqual(first);
    await expect(ipcMain.invoke('orders:read', 'ORDER-2')).resolves.toEqual(second);
  });

  it('rejects unsafe order numbers and extra read arguments', async () => {
    const ipcMain = await setup();
    await expect(ipcMain.invoke('orders:read', '../catalog')).rejects.toThrow();
    await expect(ipcMain.invoke('orders:read', 'ORDER-1', 'extra')).rejects.toThrow();
  });
});
