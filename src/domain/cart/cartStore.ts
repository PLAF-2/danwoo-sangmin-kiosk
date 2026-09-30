import { create } from 'zustand';

import type { CartItem, Product, SelectedOption } from '../contracts';
import { cartLineKey } from '../productOptions';

export type CartProduct = Pick<Product, 'id' | 'price' | 'maxQuantity'>;

interface CartState {
  items: Record<string, CartItem>;
  add: (product: CartProduct, quantity?: number, selectedOptions?: SelectedOption[]) => void;
  increment: (lineKey: string, maxQuantity: number) => void;
  decrement: (lineKey: string) => void;
  remove: (lineKey: string) => void;
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

// The maximum applies to a product as a whole, across all of its option lines.
function quantityInOtherLines(items: Record<string, CartItem>, productId: string, lineKey: string) {
  return Object.entries(items).reduce(
    (total, [key, item]) => (key !== lineKey && item.productId === productId ? total + item.quantity : total),
    0,
  );
}

export const useCartStore = create<CartState>((set, get) => ({
  items: createItemRecord(),
  add: (product, quantity = 1, selectedOptions) => {
    set(({ items }) => {
      const choices = selectedOptions?.length ? selectedOptions : undefined;
      const key = cartLineKey({ productId: product.id, selectedOptions: choices });
      const existing = Object.hasOwn(items, key) ? items[key] : undefined;
      const maximum = safeMaximum(product.maxQuantity) - quantityInOtherLines(items, product.id, key);
      const nextQuantity = Math.min((existing?.quantity ?? 0) + safeAddition(quantity), maximum);
      if (nextQuantity < 1) return { items };
      const nextItems = createItemRecord(items);
      nextItems[key] = {
        productId: product.id,
        quantity: nextQuantity,
        // A cart line is a price snapshot. Later catalog changes do not rewrite it.
        capturedUnitPrice: existing?.capturedUnitPrice ?? product.price,
        ...(choices && { selectedOptions: choices }),
      };

      return { items: nextItems };
    });
  },
  increment: (lineKey, maxQuantity) => {
    set(({ items }) => {
      const existing = Object.hasOwn(items, lineKey) ? items[lineKey] : undefined;
      if (!existing) return { items };

      const maximum = safeMaximum(maxQuantity) - quantityInOtherLines(items, existing.productId, lineKey);
      const nextItems = createItemRecord(items);
      nextItems[lineKey] = {
        ...existing,
        quantity: Math.max(1, Math.min(existing.quantity + 1, maximum)),
      };

      return { items: nextItems };
    });
  },
  decrement: (lineKey) => {
    set(({ items }) => {
      const existing = Object.hasOwn(items, lineKey) ? items[lineKey] : undefined;
      if (!existing) return { items };

      const nextItems = createItemRecord(items);
      if (existing.quantity <= 1) {
        delete nextItems[lineKey];
        return { items: nextItems };
      }

      nextItems[lineKey] = { ...existing, quantity: existing.quantity - 1 };
      return { items: nextItems };
    });
  },
  remove: (lineKey) => {
    set(({ items }) => {
      if (!Object.hasOwn(items, lineKey)) return { items };
      const nextItems = createItemRecord(items);
      delete nextItems[lineKey];
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
