import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useKioskApi } from '../../app/providers';

import { useCartStore } from '../../domain/cart/cartStore';
import type { CatalogData, Product } from '../../domain/contracts';
import { toKioskMediaUrl } from '../../services/kioskApi';

import './catalog.css';

const allCategoryId = 'all';
const won = (amount: number) => `${new Intl.NumberFormat('ko-KR').format(amount)}원`;

export interface CatalogReturnState {
  categoryId: string;
  scrollTop: number;
}

function visibleProducts(catalog: CatalogData, categoryId: string) {
  const activeCategoryIds = new Set(catalog.categories.filter(({ isActive }) => isActive).map(({ id }) => id));
  return catalog.products
    .filter(({ isVisible, categoryId: productCategoryId }) =>
      isVisible && activeCategoryIds.has(productCategoryId) && (categoryId === allCategoryId || productCategoryId === categoryId),
    )
    .sort((left, right) => left.displayOrder - right.displayOrder || left.name.localeCompare(right.name, 'ko'));
}

function ProductCard({ product, onAdd, onOpen }: { product: Product; onAdd: () => void; onOpen: () => void }) {
  const soldOut = product.saleStatus === 'soldOut';

  return (
    <article
      className="product-card"
      data-testid={`product-card-${product.id}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onOpen();
      }}
      role="button"
      tabIndex={0}
    >
      <img
        alt={product.name}
        className="product-image"
        onError={(event) => {
          event.currentTarget.onerror = null;
          event.currentTarget.src = '';
        }}
        src={toKioskMediaUrl(product.thumbnailImage)}
      />
      <div className="product-card__details">
        <strong>{product.name}</strong>
        <span>{won(product.price)}</span>
        {soldOut && <span className="sold-out">품절</span>}
        <button
          aria-label={`${product.name} 담기`}
          disabled={soldOut}
          onClick={(event) => {
            event.stopPropagation();
            onAdd();
          }}
          type="button"
        >
          +
        </button>
      </div>
    </article>
  );
}

export function CatalogPage() {
  const api = useKioskApi();
  const navigate = useNavigate();
  const location = useLocation();
  const catalogScrollRef = useRef<HTMLElement>(null);
  const returnState = location.state as Partial<CatalogReturnState> | null;
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState(returnState?.categoryId ?? allCategoryId);
  const cart = useCartStore();

  useEffect(() => {
    let active = true;
    void api.catalog.read().then((nextCatalog) => {
      if (active) setCatalog(nextCatalog);
    });
    return () => {
      active = false;
    };
  }, [api]);

  useEffect(() => {
    const scrollTop = returnState?.scrollTop;
    if (typeof scrollTop !== 'number') return;
    requestAnimationFrame(() => {
      if (catalogScrollRef.current) catalogScrollRef.current.scrollTop = scrollTop;
    });
  }, [returnState?.scrollTop]);

  const categories = useMemo(
    () => (catalog?.categories ?? []).filter(({ isActive }) => isActive).sort((left, right) => left.displayOrder - right.displayOrder),
    [catalog],
  );
  const products = useMemo(
    () => (catalog ? visibleProducts(catalog, selectedCategoryId) : []),
    [catalog, selectedCategoryId],
  );
  const cartLines = useMemo(
    () => Object.values(cart.items).flatMap((item) => {
      const product = catalog?.products.find(({ id }) => id === item.productId);
      return product ? [{ item, product }] : [];
    }),
    [cart.items, catalog],
  );

  function leaveForHome() {
    if (cart.itemCount() === 0 || window.confirm('장바구니를 비우고 처음으로 갈까요?')) {
      cart.clear();
      navigate('/');
    }
  }

  function decrease(product: Product) {
    const item = cart.items[product.id];
    if (!item) return;
    if (item.quantity === 1) {
      if (window.confirm(`${product.name}을(를) 장바구니에서 뺄까요?`)) cart.remove(product.id);
      return;
    }
    cart.decrement(product.id);
  }

  return (
    <main className="catalog-page">
      <header className="catalog-header">
        <button aria-label="처음으로" onClick={leaveForHome} type="button">처음으로</button>
        <strong>HIGHEST</strong>
      </header>
      <nav aria-label="상품 카테고리" className="category-tabs">
        <button aria-pressed={selectedCategoryId === allCategoryId} onClick={() => setSelectedCategoryId(allCategoryId)} type="button">전체</button>
        {categories.map((category) => (
          <button aria-pressed={selectedCategoryId === category.id} key={category.id} onClick={() => setSelectedCategoryId(category.id)} type="button">{category.name}</button>
        ))}
      </nav>
      <section className="catalog-scroll" data-testid="catalog-scroll" aria-label="상품 목록" ref={catalogScrollRef}>
        <div className="product-grid">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              onAdd={() => cart.add(product)}
              onOpen={() => navigate(`/products/${product.id}`, { state: { categoryId: selectedCategoryId, scrollTop: catalogScrollRef.current?.scrollTop ?? 0 } })}
              product={product}
            />
          ))}
          {catalog && products.length === 0 && <p className="catalog-empty">표시할 상품이 없습니다.</p>}
        </div>
      </section>
      <section className="cart-panel cart-panel--dock" aria-label="내가 담은 굿즈">
        <div className="cart-scroll" data-testid="cart-scroll">
          {cartLines.length === 0 ? <p>장바구니가 비어 있습니다.</p> : cartLines.map(({ item, product }) => (
            <div className="cart-line" key={product.id}>
              <img alt="" onError={(event) => { event.currentTarget.src = ''; }} src={toKioskMediaUrl(product.thumbnailImage)} />
              <span>{product.name}</span>
              <button aria-label={`${product.name} 수량 줄이기`} onClick={() => decrease(product)} type="button">−</button>
              <b>{item.quantity}</b>
              <button aria-label={`${product.name} 수량 늘리기`} onClick={() => cart.increment(product.id, product.maxQuantity)} type="button">+</button>
              <span>{won(item.quantity * item.capturedUnitPrice)}</span>
            </div>
          ))}
        </div>
        <footer className="cart-summary">
          <span>선택한 상품 {cart.itemCount()}개</span><strong>{won(cart.subtotal())}</strong>
          <button disabled={cart.itemCount() === 0} onClick={() => navigate('/checkout')} type="button">구매하러 가기</button>
        </footer>
      </section>
    </main>
  );
}
