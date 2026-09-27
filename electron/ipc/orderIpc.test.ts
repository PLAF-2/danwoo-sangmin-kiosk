import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createCatalogData, createOrderInput, createPaymentSettings, createProduct } from '../../src/test/fixtures';
import { paymentSettingsSchema } from '../../src/domain';
import { createAtomicJsonStore } from '../storage/atomicJsonStore';
import { registerOrderIpc } from './orderIpc';
import { catalogDataSchema } from './schemas';
import { createTestIpcMain, createTestIpcSecurity } from './testHelpers';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function setup(catalog = createCatalogData(), payment = createPaymentSettings()) {
  const directory = await mkdtemp(join(tmpdir(), 'highest-orders-'));
  directories.push(directory);
  const catalogFile = join(directory, 'catalog.json');
  const ordersDirectory = join(directory, 'orders');
  const paymentFile = join(directory, 'payment.json');
  await createAtomicJsonStore({ filePath: catalogFile, schema: catalogDataSchema }).write(catalog);
  await createAtomicJsonStore({ filePath: paymentFile, schema: paymentSettingsSchema }).write(payment);
  const ipcMain = createTestIpcMain();
  let sequence = 0;
  registerOrderIpc({
    ipcMain,
    catalogFile,
    ordersDirectory,
    paymentFile,
    security: createTestIpcSecurity(),
    createOrderNumber: () => `ORDER-${++sequence}`,
    now: () => new Date('2026-09-26T00:00:00.000Z'),
  });
  return ipcMain;
}

describe('order IPC', () => {
  it('rejects a stale confirmed price before creating an order', async () => {
    const ipcMain = await setup(createCatalogData({ products: [createProduct({ price: 30_000 })] }));
    await expect(ipcMain.invoke('orders:create', createOrderInput())).rejects.toThrow('Product price changed');
    await expect(ipcMain.invoke('orders:read', 'ORDER-1')).resolves.toBeNull();
  });

  it.each([
    ['mode', createPaymentSettings(), createPaymentSettings({ mode: 'simulation' })],
    ['result', createPaymentSettings({ mode: 'simulation' }), createPaymentSettings({ mode: 'simulation', simulationResult: 'failure' })],
    ['account', createPaymentSettings({ mode: 'bankQr', bankName: 'Bank', accountNumber: '123', accountHolder: 'Holder', qrImage: 'images/qr.png' }), createPaymentSettings({ mode: 'bankQr', bankName: 'Bank', accountNumber: '456', accountHolder: 'Holder', qrImage: 'images/qr.png' })],
  ])('rejects changed expected payment %s before creating an order', async (_label, expectedPayment, currentPayment) => {
    const ipcMain = await setup(createCatalogData(), currentPayment);
    await expect(ipcMain.invoke('orders:create', createOrderInput({ expectedPayment }))).rejects.toThrow('Payment settings changed');
    await expect(ipcMain.invoke('orders:read', 'ORDER-1')).resolves.toBeNull();
  });

  it('persists matching confirmed values and deduplicates the same request', async () => {
    const payment = createPaymentSettings({ mode: 'simulation', simulationResult: 'failure' });
    const ipcMain = await setup(createCatalogData(), payment);
    const input = createOrderInput({ expectedPayment: payment });
    const first = await ipcMain.invoke('orders:create', input);
    expect(first).toMatchObject({ orderNumber: 'ORDER-1', paymentMode: 'simulation', status: 'failed', subtotal: 25_000 });
    await expect(ipcMain.invoke('orders:create', input)).resolves.toEqual(first);
    await expect(ipcMain.invoke('orders:read', 'ORDER-1')).resolves.toEqual(first);
  });

  it('rejects the same request id with different expected payment', async () => {
    const ipcMain = await setup();
    const input = createOrderInput();
    await ipcMain.invoke('orders:create', input);
    await expect(ipcMain.invoke('orders:create', {
      ...input, expectedPayment: createPaymentSettings({ instructionText: 'Changed instructions' }),
    })).rejects.toThrow('requestId was already used with different order data');
  });

  it('persists matching current prices and reads the order back', async () => {
    const ipcMain = await setup();

    const order = await ipcMain.invoke(
      'orders:create',
      createOrderInput({
        items: [{ productId: 'horizon-album', quantity: 2, capturedUnitPrice: 25000 }],
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
    ['renderer payment mode', { ...createOrderInput(), paymentMode: 'bankQr' }],
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

  it('deduplicates concurrent and immediate identical duplicate-tap requests', async () => {
    const ipcMain = await setup();

    const [first, second] = await Promise.all([
      ipcMain.invoke('orders:create', createOrderInput()),
      ipcMain.invoke('orders:create', createOrderInput()),
    ]);
    const immediate = await ipcMain.invoke('orders:create', createOrderInput());

    expect(first).toEqual(second);
    expect(immediate).toEqual(first);
    expect((first as { orderNumber: string }).orderNumber).toBe('ORDER-1');
    await expect(ipcMain.invoke('orders:read', 'ORDER-1')).resolves.toEqual(first);
    await expect(ipcMain.invoke('orders:read', 'ORDER-2')).resolves.toBeNull();
  });

  it('creates a new order for a distinct request id', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'highest-orders-'));
    directories.push(directory);
    const catalogFile = join(directory, 'catalog.json');
    const paymentFile = join(directory, 'payment.json');
    await createAtomicJsonStore({ filePath: catalogFile, schema: catalogDataSchema }).write(
      createCatalogData(),
    );
    await createAtomicJsonStore({ filePath: paymentFile, schema: paymentSettingsSchema }).write(
      createPaymentSettings(),
    );
    const ipcMain = createTestIpcMain();
    let milliseconds = Date.parse('2026-09-26T00:00:00.000Z');
    let sequence = 0;
    registerOrderIpc({
      ipcMain,
      catalogFile,
      ordersDirectory: join(directory, 'orders'),
      paymentFile,
      security: createTestIpcSecurity(),
      createOrderNumber: () => `ORDER-${++sequence}`,
      now: () => new Date(milliseconds),
    });

    const first = await ipcMain.invoke('orders:create', createOrderInput());
    milliseconds += 1;
    const later = await ipcMain.invoke(
      'orders:create',
      createOrderInput({ requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }),
    );

    expect((first as { orderNumber: string }).orderNumber).toBe('ORDER-1');
    expect((later as { orderNumber: string }).orderNumber).toBe('ORDER-2');
  });

  it.each([
    ['bankQr', 'received'],
    ['instant', 'paid'],
    ['simulation', 'paid'],
  ] as const)('derives %s payment mode and terminal status from active settings', async (mode, status) => {
    const payment = createPaymentSettings(
      mode === 'bankQr'
        ? {
            mode,
            bankName: 'Bank',
            accountNumber: '123',
            accountHolder: 'Holder',
            qrImage: 'images/qr.png',
          }
        : { mode },
    );
    const ipcMain = await setup(createCatalogData(), payment);
    await expect(ipcMain.invoke('orders:create', createOrderInput({ expectedPayment: payment }))).resolves.toMatchObject({
      paymentMode: mode,
      status,
    });
  });

  it('persists simulation failure as failed and keeps same-id retries idempotent', async () => {
    const payment = createPaymentSettings({ mode: 'simulation', simulationResult: 'failure' });
    const ipcMain = await setup(createCatalogData(), payment);
    const input = createOrderInput({ expectedPayment: payment });

    const first = await ipcMain.invoke('orders:create', input);
    const duplicate = await ipcMain.invoke('orders:create', input);

    expect(first).toMatchObject({ orderNumber: 'ORDER-1', status: 'failed' });
    expect(duplicate).toEqual(first);
  });

  it('allows a failed simulation retry only with a new request id', async () => {
    const payment = createPaymentSettings({ mode: 'simulation', simulationResult: 'failure' });
    const ipcMain = await setup(createCatalogData(), payment);

    const first = await ipcMain.invoke('orders:create', createOrderInput({ expectedPayment: payment }));
    const retry = await ipcMain.invoke('orders:create', createOrderInput({
      requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      expectedPayment: payment,
    }));

    expect(first).toMatchObject({ orderNumber: 'ORDER-1', status: 'failed' });
    expect(retry).toMatchObject({ orderNumber: 'ORDER-2', status: 'failed' });
  });

  it('returns the same order after IPC registration restarts', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'highest-orders-'));
    directories.push(directory);
    const catalogFile = join(directory, 'catalog.json');
    const paymentFile = join(directory, 'payment.json');
    const ordersDirectory = join(directory, 'orders');
    await createAtomicJsonStore({ filePath: catalogFile, schema: catalogDataSchema }).write(createCatalogData());
    await createAtomicJsonStore({ filePath: paymentFile, schema: paymentSettingsSchema }).write(createPaymentSettings());
    const input = createOrderInput();

    const firstIpc = createTestIpcMain();
    registerOrderIpc({
      ipcMain: firstIpc,
      catalogFile,
      paymentFile,
      ordersDirectory,
      security: createTestIpcSecurity(),
      createOrderNumber: () => 'ORDER-FIRST',
      now: () => new Date('2026-09-26T00:00:00.000Z'),
    });
    const first = await firstIpc.invoke('orders:create', input);

    const restartedIpc = createTestIpcMain();
    registerOrderIpc({
      ipcMain: restartedIpc,
      catalogFile,
      paymentFile,
      ordersDirectory,
      security: createTestIpcSecurity(),
      createOrderNumber: () => 'ORDER-SECOND',
      now: () => new Date('2026-09-26T01:00:00.000Z'),
    });
    await expect(restartedIpc.invoke('orders:create', input)).resolves.toEqual(first);
  });

  it('rejects reuse of a request id with a different payload', async () => {
    const ipcMain = await setup();
    const input = createOrderInput();
    await ipcMain.invoke('orders:create', input);

    await expect(
      ipcMain.invoke('orders:create', {
        ...input,
        items: [{ productId: 'horizon-album', quantity: 2, capturedUnitPrice: 25000 }],
      }),
    ).rejects.toThrow('requestId was already used with different order data');
  });

  it('rejects unsafe order numbers and extra read arguments', async () => {
    const ipcMain = await setup();
    await expect(ipcMain.invoke('orders:read', '../catalog')).rejects.toThrow();
    await expect(ipcMain.invoke('orders:read', 'ORDER-1', 'extra')).rejects.toThrow();
  });
});
