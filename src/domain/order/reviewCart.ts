import type { CartItem, CatalogData, Product } from '../contracts';
import { matchesProductOptions } from '../productOptions';

type ReviewedLine = { item: CartItem; product: Product; lineTotal: number };

export function reviewCart(items: CartItem[], catalog: CatalogData) {
  const products = new Map(catalog.products.map((product) => [product.id, product]));
  const lines: ReviewedLine[] = [];
  const blockers: string[] = [];
  const priceChanges: { productId: string; name: string; before: number; after: number }[] = [];
  const productQuantities = new Map<string, number>();

  for (const item of items) {
    const product = products.get(item.productId);
    if (!product || !product.isVisible || product.saleStatus !== 'onSale') {
      blockers.push(`${product?.name ?? item.productId}은(는) 현재 판매할 수 없습니다.`);
      continue;
    }
    if (!matchesProductOptions(product, item.selectedOptions)) {
      blockers.push(`${product.name}의 옵션이 변경되었습니다. 장바구니에서 다시 선택해 주세요.`);
      continue;
    }
    productQuantities.set(product.id, (productQuantities.get(product.id) ?? 0) + item.quantity);
    if (item.capturedUnitPrice !== product.price) {
      priceChanges.push({ productId: item.productId, name: product.name, before: item.capturedUnitPrice, after: product.price });
    }
    lines.push({ item, product, lineTotal: item.quantity * product.price });
  }

  // The maximum counts every option line of the same product together.
  for (const [productId, quantity] of productQuantities) {
    const product = products.get(productId)!;
    if (quantity > product.maxQuantity) {
      blockers.push(`${product.name}은(는) 최대 ${product.maxQuantity}개까지 구매할 수 있습니다.`);
    }
  }

  return {
    lines,
    blockers,
    priceChanges,
    total: lines.reduce((sum, line) => sum + line.lineTotal, 0),
    priceKey: priceChanges.map(({ productId, after }) => `${productId}:${after}`).join('|'),
  };
}
