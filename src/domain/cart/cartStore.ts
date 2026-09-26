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

const emptyItems: Record<string, CartItem> = {};

function safeMaximum(maxQuantity: number) {
  return Number.isFinite(maxQuantity) ? Math.max(1, Math.trunc(maxQuantity)) : 1;
}

function safeAddition(quantity: number) {
  return Number.isFinite(quantity) ? Math.max(1, Math.trunc(quantity)) : 1;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: emptyItems,
  add: (product, quantity = 1) => {
    set(({ items }) => {
      const existing = items[product.id];
      const maximum = safeMaximum(product.maxQuantity);
      const nextQuantity = Math.min((existing?.quantity ?? 0) + safeAddition(quantity), maximum);

      return {
        items: {
          ...items,
          [product.id]: {
            productId: product.id,
            quantity: nextQuantity,
            // A cart line is a price snapshot. Later catalog changes do not rewrite it.
            capturedUnitPrice: existing?.capturedUnitPrice ?? product.price,
          },
        },
      };
    });
  },
  increment: (productId, maxQuantity) => {
    set(({ items }) => {
      const existing = items[productId];
      if (!existing) return { items };

      return {
        items: {
          ...items,
          [productId]: {
            ...existing,
            quantity: Math.min(existing.quantity + 1, safeMaximum(maxQuantity)),
          },
        },
      };
    });
  },
  decrement: (productId) => {
    set(({ items }) => {
      const existing = items[productId];
      if (!existing) return { items };

      if (existing.quantity <= 1) {
        const nextItems = { ...items };
        delete nextItems[productId];
        return { items: nextItems };
      }

      return {
        items: {
          ...items,
          [productId]: { ...existing, quantity: existing.quantity - 1 },
        },
      };
    });
  },
  remove: (productId) => {
    set(({ items }) => {
      if (!items[productId]) return { items };
      const nextItems = { ...items };
      delete nextItems[productId];
      return { items: nextItems };
    });
  },
  clear: () => set({ items: {} }),
  itemCount: () =>
    Object.values(get().items).reduce((total, item) => total + item.quantity, 0),
  subtotal: () =>
    Object.values(get().items).reduce(
      (total, item) => total + item.quantity * item.capturedUnitPrice,
      0,
    ),
}));
