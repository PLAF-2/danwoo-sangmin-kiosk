import { describe, expect, it } from 'vitest';

import { createCartItem, createCatalogData, createProduct } from '../../test/fixtures';
import { reviewCart } from './reviewCart';

describe('reviewCart', () => {
  it('uses current prices for line totals and the total', () => {
    const item = createCartItem({ quantity: 2 });
    const product = createProduct({ price: 27000 });
    const review = reviewCart([item], createCatalogData({ products: [product] }));

    expect(review.lines).toEqual([{ item, product, lineTotal: 54000 }]);
    expect(review.total).toBe(54000);
  });

  it('reports price changes and builds a price key in cart order', () => {
    const first = createCartItem({ productId: 'first', capturedUnitPrice: 10 });
    const second = createCartItem({ productId: 'second', capturedUnitPrice: 20 });
    const review = reviewCart([first, second], createCatalogData({
      products: [
        createProduct({ id: 'second', name: 'Second', price: 25 }),
        createProduct({ id: 'first', name: 'First', price: 15 }),
      ],
    }));

    expect(review.priceChanges).toEqual([
      { productId: 'first', name: 'First', before: 10, after: 15 },
      { productId: 'second', name: 'Second', before: 20, after: 25 },
    ]);
    expect(review.priceKey).toBe('first:15|second:25');
  });

  it.each([
    ['hidden', createProduct({ isVisible: false })],
    ['sold out', createProduct({ saleStatus: 'soldOut' })],
  ])('blocks %s products once and omits them from lines', (_label, product) => {
    const review = reviewCart([createCartItem()], createCatalogData({ products: [product] }));

    expect(review.blockers).toHaveLength(1);
    expect(review.lines).toEqual([]);
  });

  it('blocks a missing product once and omits it from lines', () => {
    const review = reviewCart([createCartItem({ productId: 'missing' })], createCatalogData({ products: [] }));

    expect(review.blockers).toHaveLength(1);
    expect(review.lines).toEqual([]);
  });

  it('keeps over-maximum items in lines and adds a blocker', () => {
    const item = createCartItem({ quantity: 6 });
    const product = createProduct({ maxQuantity: 5 });
    const review = reviewCart([item], createCatalogData({ products: [product] }));

    expect(review.blockers).toEqual(['HORIZON Album은(는) 최대 5개까지 구매할 수 있습니다.']);
    expect(review.lines).toEqual([{ item, product, lineTotal: 150000 }]);
  });
});
