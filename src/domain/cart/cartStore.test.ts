import { beforeEach, describe, expect, it } from 'vitest';

import type { Product } from '../contracts';
import { useCartStore } from './cartStore';

const product = {
  id: 'album',
  price: 25_000,
  maxQuantity: 3,
} satisfies Pick<Product, 'id' | 'price' | 'maxQuantity'>;

describe('cart store', () => {
  beforeEach(() => {
    useCartStore.getState().clear();
  });

  it('adds a product and captures its unit price', () => {
    useCartStore.getState().add(product);

    expect(useCartStore.getState().items).toEqual({
      album: { productId: 'album', quantity: 1, capturedUnitPrice: 25_000 },
    });
    expect(useCartStore.getState().itemCount()).toBe(1);
    expect(useCartStore.getState().subtotal()).toBe(25_000);
  });

  it('merges a repeated product while retaining the originally captured price', () => {
    useCartStore.getState().add(product);
    useCartStore.getState().add({ ...product, price: 30_000 });

    expect(useCartStore.getState().items.album).toEqual({
      productId: 'album',
      quantity: 2,
      capturedUnitPrice: 25_000,
    });
  });

  it('clamps additions and increments to the supplied product maximum', () => {
    useCartStore.getState().add(product, 99);
    useCartStore.getState().increment(product.id, product.maxQuantity);

    expect(useCartStore.getState().items.album?.quantity).toBe(3);
  });

  it('uses the latest supplied maximum when an existing product maximum decreases', () => {
    useCartStore.getState().add(product, 3);
    useCartStore.getState().add({ ...product, maxQuantity: 2 });

    expect(useCartStore.getState().items.album?.quantity).toBe(2);
  });

  it('decrements quantities and removes the item when it reaches zero', () => {
    useCartStore.getState().add(product, 2);
    useCartStore.getState().decrement(product.id);
    expect(useCartStore.getState().items.album?.quantity).toBe(1);

    useCartStore.getState().decrement(product.id);
    expect(useCartStore.getState().items.album).toBeUndefined();
  });

  it('removes one product without changing other products', () => {
    useCartStore.getState().add(product);
    useCartStore.getState().add({ id: 'keyring', price: 12_000, maxQuantity: 5 });

    useCartStore.getState().remove(product.id);

    expect(useCartStore.getState().items).toEqual({
      keyring: { productId: 'keyring', quantity: 1, capturedUnitPrice: 12_000 },
    });
  });

  it('ignores increments and decrements for products not in the cart', () => {
    useCartStore.getState().increment('missing', 4);
    useCartStore.getState().decrement('missing');

    expect(useCartStore.getState().items).toEqual({});
  });

  it('clears all items and totals', () => {
    useCartStore.getState().add(product, 2);

    useCartStore.getState().clear();

    expect(useCartStore.getState().items).toEqual({});
    expect(useCartStore.getState().itemCount()).toBe(0);
    expect(useCartStore.getState().subtotal()).toBe(0);
  });
});
