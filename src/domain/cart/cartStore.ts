import { create } from 'zustand';

import type { CartItem, Product } from '../contracts';

export type CartProduct = Pick<Product, 'id' | 'price' | 'maxQuantity'>;

interface CartState {
  items: Record<string, CartItem>;
  add: (product: CartProduct, quantity?: number) => void;
  increment: (productId: string, maxQuantity: number) => void;
  decrement: (productId: string) => void;
  remove: (productId: string) => void;
  clear: () => void;
  itemCount: () => number;
  subtotal: () => number;
}

function createItemRecord(items?: Record<string, CartItem>): Record<string, CartItem> {
  return Object.assign(Object.create(null) as Record<string, CartItem>, items);
}

function safeMaximum(maxQuantity: number) {
  return Number.isFinite(maxQuantity) ? Math.max(1, Math.trunc(maxQuantity)) : 1;
}

function safeAddition(quantity: number) {
  return Number.isFinite(quantity) ? Math.max(1, Math.trunc(quantity)) : 1;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: createItemRecord(),
  add: (product, quantity = 1) => {
    set(({ items }) => {
      const existing = Object.hasOwn(items, product.id) ? items[product.id] : undefined;
      const maximum = safeMaximum(product.maxQuantity);
      const nextQuantity = Math.min((existing?.quantity ?? 0) + safeAddition(quantity), maximum);
      const nextItems = createItemRecord(items);
      nextItems[product.id] = {
        productId: product.id,
        quantity: nextQuantity,
        // A cart line is a price snapshot. Later catalog changes do not rewrite it.
        capturedUnitPrice: existing?.capturedUnitPrice ?? product.price,
      };

      return { items: nextItems };
    });
  },
  increment: (productId, maxQuantity) => {
    set(({ items }) => {
      const existing = Object.hasOwn(items, productId) ? items[productId] : undefined;
      if (!existing) return { items };

      const nextItems = createItemRecord(items);
      nextItems[productId] = {
        ...existing,
        quantity: Math.min(existing.quantity + 1, safeMaximum(maxQuantity)),
      };

      return { items: nextItems };
    });
  },
  decrement: (productId) => {
    set(({ items }) => {
      const existing = Object.hasOwn(items, productId) ? items[productId] : undefined;
      if (!existing) return { items };

      const nextItems = createItemRecord(items);
      if (existing.quantity <= 1) {
        delete nextItems[productId];
        return { items: nextItems };
      }

      nextItems[productId] = { ...existing, quantity: existing.quantity - 1 };
      return { items: nextItems };
    });
  },
  remove: (productId) => {
    set(({ items }) => {
      if (!Object.hasOwn(items, productId)) return { items };
      const nextItems = createItemRecord(items);
      delete nextItems[productId];
      return { items: nextItems };
    });
  },
  clear: () => set({ items: createItemRecord() }),
  itemCount: () =>
    Object.values(get().items).reduce((total, item) => total + item.quantity, 0),
  subtotal: () =>
    Object.values(get().items).reduce(
      (total, item) => total + item.quantity * item.capturedUnitPrice,
      0,
    ),
}));
