import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useKioskApi } from '../../app/providers';

import { useCartStore } from '../../domain/cart/cartStore';
import type { CatalogData, Product, SelectedOption } from '../../domain/contracts';
import { formatSelectedOptions } from '../../domain/productOptions';
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
          <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18">
            <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.8" />
          </svg>
        </button>
      </div>
    </article>
  );
}

export function OptionPicker({ product, onCancel, onConfirm }: {
  product: Product;
  onCancel: () => void;
  onConfirm: (selectedOptions: SelectedOption[]) => void;
}) {
  const options = product.options ?? [];
  const [choices, setChoices] = useState<Record<string, string>>({});
  const complete = options.every(({ name }) => Object.hasOwn(choices, name));

  return (
    <div className="option-picker-backdrop" onClick={onCancel} role="presentation">
      <section
        aria-labelledby="option-picker-title"
        aria-modal="true"
        className="option-picker"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header>
          <img alt="" src={toKioskMediaUrl(product.thumbnailImage)} />
          <div><h2 id="option-picker-title">{product.name}</h2><span>{won(product.price)}</span></div>
        </header>
        {options.map((option) => (
          <fieldset key={option.name}>
            <legend>{option.name} 선택</legend>
            <div>
              {option.values.map((value) => (
                <button
                  aria-pressed={choices[option.name] === value}
                  key={value}
                  onClick={() => setChoices({ ...choices, [option.name]: value })}
                  type="button"
                >
                  {value}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
        <footer>
          <button onClick={onCancel} type="button">취소</button>
          <button
            disabled={!complete}
            onClick={() => onConfirm(options.map(({ name }) => ({ name, value: choices[name]! })))}
            type="button"
          >
            장바구니에 담기
          </button>
        </footer>
      </section>
    </div>
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
  const [optionProduct, setOptionProduct] = useState<Product | null>(null);
  const [confirmingHome, setConfirmingHome] = useState(false);
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
    () => Object.entries(cart.items).flatMap(([key, item]) => {
      const product = catalog?.products.find(({ id }) => id === item.productId);
      if (!product) return [];
      const options = formatSelectedOptions(item.selectedOptions);
      return [{ key, item, product, options, label: options ? `${product.name} (${options})` : product.name }];
    }),
    [cart.items, catalog],
  );
  const cartOpen = cart.itemCount() > 0;
  // Keeps the last filled cart on screen while the dock slides away, so it never flashes "0원".
  const [dock, setDock] = useState({ lines: cartLines, count: 0, subtotal: 0 });
  useEffect(() => {
    if (cartOpen) setDock({ lines: cartLines, count: cart.itemCount(), subtotal: cart.subtotal() });
  }, [cart, cartLines, cartOpen]);
  const shownDock = cartOpen ? { lines: cartLines, count: cart.itemCount(), subtotal: cart.subtotal() } : dock;

  function goHome() {
    cart.clear();
    navigate('/');
  }

  function leaveForHome() {
    if (cart.itemCount() === 0) goHome();
    else setConfirmingHome(true);
  }


  function addProduct(product: Product) {
    if (product.options?.length) setOptionProduct(product);
    else cart.add(product);
  }

  return (
    <main className={`catalog-page${cartOpen ? ' catalog-page--cart-open' : ''}`}>
      <header className="catalog-header">
        <button aria-label="처음으로" className="catalog-home" onClick={leaveForHome} type="button">
          <svg aria-hidden="true" height="22" viewBox="0 0 24 24" width="22">
            <path d="M3 10.6 12 3l9 7.6V20a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1z" fill="currentColor" />
          </svg>
        </button>
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
              onAdd={() => addProduct(product)}
              onOpen={() => navigate(`/products/${product.id}`, { state: { categoryId: selectedCategoryId, scrollTop: catalogScrollRef.current?.scrollTop ?? 0 } })}
              product={product}
            />
          ))}
          {catalog && products.length === 0 && <p className="catalog-empty">표시할 상품이 없습니다.</p>}
        </div>
      </section>
      <section
        aria-hidden={!cartOpen}
        aria-label="내가 담은 굿즈"
        className={`cart-panel cart-panel--dock${cartOpen ? ' cart-panel--open' : ''}`}
        inert={!cartOpen}
      >
        <div className="cart-scroll cart-dock__items cart-dock__items--scrollable" data-testid="cart-scroll">
          {shownDock.lines.map(({ key, item, product, options, label }) => (
            <div className="cart-line" key={key}>
              <img alt="" onError={(event) => { event.currentTarget.src = ''; }} src={toKioskMediaUrl(product.thumbnailImage)} />
              <span className="cart-line__name">{product.name}{options && <small>{options}</small>}</span>
              <button aria-label={`${label} 수량 줄이기`} onClick={() => cart.decrement(key)} type="button">−</button>
              <b>{item.quantity}</b>
              <button aria-label={`${label} 수량 늘리기`} onClick={() => cart.increment(key, product.maxQuantity)} type="button">+</button>
              <span>{won(item.quantity * item.capturedUnitPrice)}</span>
            </div>
          ))}
        </div>
        <footer className="cart-summary">
          <span>선택한 상품 {shownDock.count}개</span><strong>{won(shownDock.subtotal)}</strong>
          <button disabled={!cartOpen} onClick={() => navigate('/checkout')} type="button">구매하러 가기</button>
        </footer>
      </section>
      {confirmingHome && (
        <div className="kiosk-dialog-backdrop" onClick={() => setConfirmingHome(false)} role="presentation">
          <div
            aria-labelledby="leave-home-title"
            aria-modal="true"
            className="kiosk-dialog"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <strong id="leave-home-title">처음 화면으로 갈까요?</strong>
            <p>담은 상품 {cart.itemCount()}개가 장바구니에서 모두 빠집니다.</p>
            <div className="kiosk-dialog-actions">
              <button className="kiosk-dialog-secondary" onClick={() => setConfirmingHome(false)} type="button">계속 쇼핑하기</button>
              <button onClick={goHome} type="button">처음으로</button>
            </div>
          </div>
        </div>
      )}
      {optionProduct && (
        <OptionPicker
          onCancel={() => setOptionProduct(null)}
          onConfirm={(selectedOptions) => {
            cart.add(optionProduct, 1, selectedOptions);
            setOptionProduct(null);
          }}
          product={optionProduct}
        />
      )}
    </main>
  );
}
