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

  it.each(['constructor', '__proto__', 'toString'])(
    'stores prototype-name product id %s as an ordinary cart line',
    (productId) => {
      useCartStore.getState().increment(productId, 4);
      useCartStore.getState().decrement(productId);
      expect(Object.hasOwn(useCartStore.getState().items, productId)).toBe(false);
      expect(useCartStore.getState().itemCount()).toBe(0);
      expect(useCartStore.getState().subtotal()).toBe(0);

      useCartStore.getState().add({ id: productId, price: 1_500, maxQuantity: 4 }, 2);

      const state = useCartStore.getState();
      expect(Object.hasOwn(state.items, productId)).toBe(true);
      expect(state.items[productId]).toEqual({
        productId,
        quantity: 2,
        capturedUnitPrice: 1_500,
      });
      expect(state.itemCount()).toBe(2);
      expect(state.subtotal()).toBe(3_000);
      expect(Number.isFinite(state.subtotal())).toBe(true);

      state.remove(productId);
      expect(Object.hasOwn(useCartStore.getState().items, productId)).toBe(false);
    },
  );

  it('keeps each option choice on its own line while limiting the product total', () => {
    const danwoo = [{ name: '인형', value: '단우' }];
    const sangmin = [{ name: '인형', value: '상민' }];
    const set = { id: 'set', price: 60_000, maxQuantity: 3 };

    useCartStore.getState().add(set, 1, danwoo);
    useCartStore.getState().add(set, 1, sangmin);
    useCartStore.getState().add(set, 1, danwoo);

    const lines = Object.entries(useCartStore.getState().items);
    expect(lines.map(([, item]) => item)).toEqual([
      { productId: 'set', quantity: 2, capturedUnitPrice: 60_000, selectedOptions: danwoo },
      { productId: 'set', quantity: 1, capturedUnitPrice: 60_000, selectedOptions: sangmin },
    ]);

    const [danwooKey, sangminKey] = lines.map(([key]) => key);
    useCartStore.getState().increment(sangminKey!, set.maxQuantity);
    useCartStore.getState().add(set, 1, danwoo);
    expect(useCartStore.getState().itemCount()).toBe(3);

    useCartStore.getState().decrement(danwooKey!);
    useCartStore.getState().increment(sangminKey!, set.maxQuantity);
    expect(useCartStore.getState().items[sangminKey!]?.quantity).toBe(2);
    expect(useCartStore.getState().itemCount()).toBe(3);
  });

  it('clears all items and totals', () => {
    useCartStore.getState().add(product, 2);

    useCartStore.getState().clear();

    expect(useCartStore.getState().items).toEqual({});
    expect(useCartStore.getState().itemCount()).toBe(0);
    expect(useCartStore.getState().subtotal()).toBe(0);
  });
});
