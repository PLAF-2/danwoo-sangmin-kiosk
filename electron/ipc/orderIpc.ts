import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';

import { orderSchema, type Order, type OrderStatus } from '../../src/domain';
import { createAtomicJsonStore } from '../storage/atomicJsonStore';
import { IPC_CHANNELS, type IpcMainLike } from './channels';
import { catalogDataSchema, createOrderInputSchema } from './schemas';

const orderNumberSchema = z.string().regex(/^[A-Za-z0-9-]{1,100}$/u);

function defaultOrderNumber(now: Date): string {
  const date = now.toISOString().slice(0, 10).replaceAll('-', '');
  return `${date}-${randomUUID()}`;
}

function statusFor(paymentMode: Order['paymentMode']): OrderStatus {
  if (paymentMode === 'bankQr') return 'received';
  if (paymentMode === 'instant') return 'paid';
  return 'processing';
}

export function registerOrderIpc({
  ipcMain,
  catalogFile,
  ordersDirectory,
  now = () => new Date(),
  createOrderNumber = () => defaultOrderNumber(now()),
}: {
  ipcMain: IpcMainLike;
  catalogFile: string;
  ordersDirectory: string;
  now?: () => Date;
  createOrderNumber?: () => string;
}): void {
  const catalogStore = createAtomicJsonStore({ filePath: catalogFile, schema: catalogDataSchema });
  let creationQueue: Promise<void> = Promise.resolve();

  ipcMain.handle(IPC_CHANNELS.ordersCreate, (_event, ...args) => {
    const [input] = z.tuple([createOrderInputSchema]).parse(args);

    const operation = creationQueue.then(async () => {
      const catalog = await catalogStore.read();
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
        paymentMode: input.paymentMode,
        status: statusFor(input.paymentMode),
        createdAt: now().toISOString(),
      });

      await createAtomicJsonStore({
        filePath: join(ordersDirectory, `${orderNumber}.json`),
        schema: orderSchema,
      }).write(order);
      return order;
    });

    // CreateOrderInput deliberately has no idempotency token. Calls are serialized so
    // each renderer invocation creates exactly one order and receives its own result.
    creationQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  });

  ipcMain.handle(IPC_CHANNELS.ordersRead, async (_event, ...args) => {
    const [orderNumber] = z.tuple([orderNumberSchema]).parse(args);
    try {
      return await createAtomicJsonStore({
        filePath: join(ordersDirectory, `${orderNumber}.json`),
        schema: orderSchema,
      }).read();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  });
}
