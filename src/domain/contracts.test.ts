import { describe, expect, it } from 'vitest';

import catalogDefaults from '../../data/defaults/catalog.json';
import paymentDefaults from '../../data/defaults/payment.json';
import settingsDefaults from '../../data/defaults/settings.json';
import {
  appSettingsSchema,
  cartItemSchema,
  categorySchema,
  orderSchema,
  paymentSettingsSchema,
  productSchema,
} from './contracts';
import {
  createAppSettings,
  createCartItem,
  createCategory,
  createOrder,
  createPaymentSettings,
  createProduct,
} from '../test/fixtures';

const validCategory = createCategory();
const validProduct = createProduct();
const validCartItem = createCartItem();

describe('catalog contracts', () => {
  it('accepts valid categories and rejects unknown fields', () => {
    expect(categorySchema.parse(validCategory)).toEqual(validCategory);
    expect(() => categorySchema.parse({ ...validCategory, slug: 'albums' })).toThrow();
  });

  it('accepts a valid product', () => {
    expect(productSchema.parse(validProduct)).toEqual(validProduct);
  });

  it.each([
    ['negative price', { price: -1 }],
    ['fractional price', { price: 1.5 }],
    ['zero max quantity', { maxQuantity: 0 }],
    ['invalid sale status', { saleStatus: 'archived' }],
    ['invalid timestamp', { updatedAt: 'today' }],
  ])('rejects a product with %s', (_label, replacement) => {
    expect(() => productSchema.parse({ ...validProduct, ...replacement })).toThrow();
  });
});

describe('cart and order contracts', () => {
  it('requires positive integer quantities and non-negative integer captured prices', () => {
    expect(cartItemSchema.parse(validCartItem)).toEqual(validCartItem);
    expect(() => cartItemSchema.parse({ ...validCartItem, quantity: 0 })).toThrow();
    expect(() => cartItemSchema.parse({ ...validCartItem, quantity: 1.5 })).toThrow();
    expect(() => cartItemSchema.parse({ ...validCartItem, capturedUnitPrice: -1 })).toThrow();
  });

  it('accepts an order whose totals reconcile', () => {
    const order = createOrder();

    expect(orderSchema.parse(order)).toEqual(order);
    expect(() => orderSchema.parse({ ...order, total: 24999 })).toThrow();
    expect(() => orderSchema.parse({ ...order, status: 'refunded' })).toThrow();
  });
});

describe('settings contracts', () => {
  const validAppSettings = createAppSettings();
  const validPaymentSettings = createPaymentSettings();

  it('accepts valid app settings and rejects unsafe timing and image bounds', () => {
    expect(appSettingsSchema.parse(validAppSettings)).toEqual(validAppSettings);
    expect(() => appSettingsSchema.parse({ ...validAppSettings, idleWarningSeconds: 90 })).toThrow();
    expect(() =>
      appSettingsSchema.parse({
        ...validAppSettings,
        welcomeImagePosition: { x: 101, y: 50 },
      }),
    ).toThrow();
    expect(() => appSettingsSchema.parse({ ...validAppSettings, extra: true })).toThrow();
  });

  it.each([0, 6, 1.5])('rejects processingSeconds=%s', (processingSeconds) => {
    expect(() => paymentSettingsSchema.parse({ ...validPaymentSettings, processingSeconds })).toThrow();
  });

  it('accepts payment settings and rejects unsupported modes and results', () => {
    expect(paymentSettingsSchema.parse(validPaymentSettings)).toEqual(validPaymentSettings);
    expect(() => paymentSettingsSchema.parse({ ...validPaymentSettings, mode: 'card' })).toThrow();
    expect(() =>
      paymentSettingsSchema.parse({ ...validPaymentSettings, simulationResult: 'random' }),
    ).toThrow();
  });
});

describe('shipped defaults', () => {
  it('ships a valid catalog', () => {
    expect(catalogDefaults.categories.map((category) => categorySchema.parse(category))).toEqual(
      catalogDefaults.categories,
    );
    expect(catalogDefaults.products.map((product) => productSchema.parse(product))).toEqual(
      catalogDefaults.products,
    );
  });

  it('ships valid app settings', () => {
    expect(appSettingsSchema.parse(settingsDefaults)).toEqual(settingsDefaults);
  });

  it('ships valid payment settings without a hardcoded account number', () => {
    expect(paymentSettingsSchema.parse(paymentDefaults)).toEqual(paymentDefaults);
    expect(paymentDefaults.accountNumber).toBe('');
  });
});
