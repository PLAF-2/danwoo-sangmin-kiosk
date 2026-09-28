import { existsSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import catalogDefaults from '../../data/defaults/catalog.json';
import paymentDefaults from '../../data/defaults/payment.json';
import settingsDefaults from '../../data/defaults/settings.json';
import {
  appSettingsSchema,
  cartItemSchema,
  categorySchema,
  imageReferenceSchema,
  orderSchema,
  ownedImagePathSchema,
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
  it.each([
    '../secret.png',
    'images/../../secret.png',
    'other/image.png',
    'images\\secret.png',
    'images//secret.png',
    'images/file.txt',
    'images/animated.gif',
    'images/C:/secret.png',
    'images/file.png?query=1',
    'images/CON.png',
    'images/products/aux.jpg',
    'images/LPT1/detail.png',
  ])('rejects unsafe owned image path %s at save boundaries', (imagePath) => {
    expect(() => ownedImagePathSchema.parse(imagePath)).toThrow();
    expect(() => productSchema.parse({ ...validProduct, thumbnailImage: imagePath })).toThrow();
  });

  it('accepts shipped internal SVG paths but not empty required product paths', () => {
    expect(ownedImagePathSchema.parse('images/horizon-album.svg')).toBe('images/horizon-album.svg');
    expect(() => productSchema.parse({ ...validProduct, thumbnailImage: '' })).toThrow();
  });

  it('accepts hosted HTTPS images in all image reference fields', () => {
    const url = 'https://example.public.blob.vercel-storage.com/products/album.png';
    expect(imageReferenceSchema.parse(url)).toBe(url);
    expect(() => ownedImagePathSchema.parse(url)).toThrow();
    expect(productSchema.parse({ ...validProduct, thumbnailImage: url, detailImages: [url] })).toBeTruthy();
    expect(orderSchema.parse({ ...createOrder(), items: [{ ...createOrder().items[0], thumbnailImage: url }] })).toBeTruthy();
    expect(appSettingsSchema.parse({ ...createAppSettings(), welcomeBackgroundImage: url })).toBeTruthy();
    expect(paymentSettingsSchema.parse({ ...createPaymentSettings(), qrImage: url })).toBeTruthy();
    expect(() => imageReferenceSchema.parse('http://example.com/image.png')).toThrow();
  });

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

  it('rejects an order whose subtotal does not equal its item total', () => {
    const order = createOrder({
      items: [
        {
          ...createCartItem({ quantity: 2 }),
          name: 'HORIZON Album',
          thumbnailImage: 'images/horizon-album.svg',
        },
      ],
    });

    expect(() => orderSchema.parse(order)).toThrow();
  });
});

describe('settings contracts', () => {
  const validAppSettings = createAppSettings();
  const validPaymentSettings = createPaymentSettings();
  const validBankQrSettings = createPaymentSettings({
    mode: 'bankQr',
    bankName: '샘플은행',
    accountNumber: 'configured-at-runtime',
    accountHolder: 'HIGHEST',
    qrImage: 'images/payment-qr.svg',
  });

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
    expect(() =>
      appSettingsSchema.parse({ ...validAppSettings, welcomeBackgroundImage: '../outside.png' }),
    ).toThrow();
    expect(appSettingsSchema.parse({ ...validAppSettings, welcomeBackgroundImage: '' })).toBeTruthy();
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
    expect(() =>
      paymentSettingsSchema.parse({ ...validPaymentSettings, qrImage: 'images/../outside.png' }),
    ).toThrow();
    expect(paymentSettingsSchema.parse({ ...validPaymentSettings, qrImage: '' })).toBeTruthy();
  });

  it('accepts complete bank and QR details in bankQr mode', () => {
    expect(paymentSettingsSchema.parse(validBankQrSettings)).toEqual(validBankQrSettings);
  });

  it.each(['bankName', 'accountNumber', 'accountHolder', 'qrImage'] as const)(
    'rejects a blank %s in bankQr mode',
    (field) => {
      expect(() =>
        paymentSettingsSchema.parse({ ...validBankQrSettings, [field]: '   ' }),
      ).toThrow();
    },
  );
});

describe('shipped defaults', () => {
  it('ships a valid catalog', () => {
    expect(catalogDefaults.categories.map((category) => categorySchema.parse(category))).toEqual(
      catalogDefaults.categories,
    );
    expect(catalogDefaults.products.map((product) => productSchema.parse(product))).toEqual(
      catalogDefaults.products,
    );
    expect(catalogDefaults.categories.find(({ id }) => id === 'goods')?.name).toBe('굿즈');
  });

  it('ships valid app settings', () => {
    expect(appSettingsSchema.parse(settingsDefaults)).toEqual(settingsDefaults);
  });

  it('ships valid payment settings without a hardcoded account number', () => {
    expect(paymentSettingsSchema.parse(paymentDefaults)).toEqual(paymentDefaults);
    expect(paymentDefaults.accountNumber).toBe('');
  });

  it('ships only safe image paths that resolve to default assets', () => {
    const defaultsDirectory = path.resolve(process.cwd(), 'data/defaults');
    const imagePaths = [
      settingsDefaults.welcomeBackgroundImage,
      paymentDefaults.qrImage,
      ...catalogDefaults.products.flatMap(({ thumbnailImage, detailImages }) => [
        thumbnailImage,
        ...detailImages,
      ]),
    ].filter((imagePath) => imagePath.length > 0);

    expect(imagePaths.length).toBeGreaterThan(0);
    for (const imagePath of imagePaths) {
      const resolvedPath = path.resolve(defaultsDirectory, imagePath);
      const relativePath = path.relative(defaultsDirectory, resolvedPath);

      expect(relativePath.startsWith('..') || path.isAbsolute(relativePath)).toBe(false);
      expect(existsSync(resolvedPath), imagePath).toBe(true);
    }
  });
});
