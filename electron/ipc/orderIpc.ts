import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';

import {
  orderSchema,
  paymentSettingsSchema,
  type Order,
  type OrderStatus,
} from '../../src/domain';
import { createAtomicJsonStore } from '../storage/atomicJsonStore';
import { IPC_CHANNELS, type IpcMainLike } from './channels';
import type { IpcSecurity } from './ipcSecurity';
import { catalogDataSchema, createOrderInputSchema } from './schemas';

const orderNumberSchema = z.string().regex(/^[A-Za-z0-9-]{1,100}$/u);
const requestRecordSchema = z
  .object({ requestId: z.uuid(), fingerprint: z.string().min(1), order: orderSchema })
  .strict();

function defaultOrderNumber(now: Date): string {
  const date = now.toISOString().slice(0, 10).replaceAll('-', '');
  return `${date}-${randomUUID()}`;
}

function statusFor(paymentMode: Order['paymentMode']): OrderStatus {
  if (paymentMode === 'bankQr') return 'received';
  if (paymentMode === 'instant') return 'paid';
  return 'processing';
}

async function readIfPresent<T>(store: ReturnType<typeof createAtomicJsonStore<T>>): Promise<T | null> {
  try {
    return await store.read();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export function registerOrderIpc({
  ipcMain,
  catalogFile,
  paymentFile,
  ordersDirectory,
  security,
  now = () => new Date(),
  createOrderNumber = () => defaultOrderNumber(now()),
}: {
  ipcMain: IpcMainLike;
  catalogFile: string;
  paymentFile: string;
  ordersDirectory: string;
  security: IpcSecurity;
  now?: () => Date;
  createOrderNumber?: () => string;
}): void {
  const catalogStore = createAtomicJsonStore({ filePath: catalogFile, schema: catalogDataSchema });
  const paymentStore = createAtomicJsonStore({ filePath: paymentFile, schema: paymentSettingsSchema });
  let creationQueue: Promise<void> = Promise.resolve();
  const inFlight = new Map<string, { fingerprint: string; promise: Promise<Order> }>();

  ipcMain.handle(IPC_CHANNELS.ordersCreate, (event, ...args) => {
    security.authorizePublic(event);
    const [input] = z.tuple([createOrderInputSchema]).parse(args);
    const fingerprint = JSON.stringify(input.items);
    const pending = inFlight.get(input.requestId);
    if (pending) {
      if (pending.fingerprint !== fingerprint) {
        throw new Error('requestId was already used with different order data');
      }
      return pending.promise;
    }

    const operation = creationQueue.then(async () => {
      const requestStore = createAtomicJsonStore({
        filePath: join(ordersDirectory, '.requests', `${input.requestId}.json`),
        schema: requestRecordSchema,
      });
      const existing = await readIfPresent(requestStore);
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          throw new Error('requestId was already used with different order data');
        }
        await createAtomicJsonStore({
          filePath: join(ordersDirectory, `${existing.order.orderNumber}.json`),
          schema: orderSchema,
        }).writeIfAbsent(existing.order);
        return existing.order;
      }

      const [catalog, payment] = await Promise.all([catalogStore.read(), paymentStore.read()]);
      const products = new Map(catalog.products.map((product) => [product.id, product]));
      const items = input.items.map(({ productId, quantity }) => {
        const product = products.get(productId);
        if (!product) throw new Error(`Unknown product: ${productId}`);
        if (!product.isVisible || product.saleStatus !== 'onSale') {
          throw new Error(`Product is not available: ${productId}`);
        }
        if (quantity > product.maxQuantity) {
          throw new Error(`Quantity exceeds current maximum for product: ${productId}`);
        }
        return {
          productId,
          quantity,
          capturedUnitPrice: product.price,
          name: product.name,
          thumbnailImage: product.thumbnailImage,
        };
      });
      const subtotal = items.reduce(
        (sum, { quantity, capturedUnitPrice }) => sum + quantity * capturedUnitPrice,
        0,
      );
      const orderNumber = orderNumberSchema.parse(createOrderNumber());
      const order = orderSchema.parse({
        orderNumber,
        items,
        subtotal,
        discount: 0,
        total: subtotal,
        paymentMode: payment.mode,
        status: statusFor(payment.mode),
        createdAt: now().toISOString(),
      });
      const record = { requestId: input.requestId, fingerprint, order };
      if (!(await requestStore.writeIfAbsent(record))) {
        const winner = await requestStore.read();
        if (winner.fingerprint !== fingerprint) {
          throw new Error('requestId was already used with different order data');
        }
        return winner.order;
      }
      await createAtomicJsonStore({
        filePath: join(ordersDirectory, `${orderNumber}.json`),
        schema: orderSchema,
      }).writeIfAbsent(order);
      return order;
    });

    inFlight.set(input.requestId, { fingerprint, promise: operation });
    const clearInFlight = () => {
      if (inFlight.get(input.requestId)?.promise === operation) inFlight.delete(input.requestId);
    };
    void operation.then(clearInFlight, clearInFlight);
    creationQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  });

  ipcMain.handle(IPC_CHANNELS.ordersRead, async (event, ...args) => {
    security.authorizePublic(event);
    const [orderNumber] = z.tuple([orderNumberSchema]).parse(args);
    return readIfPresent(
      createAtomicJsonStore({
        filePath: join(ordersDirectory, `${orderNumber}.json`),
        schema: orderSchema,
      }),
    );
  });
}
