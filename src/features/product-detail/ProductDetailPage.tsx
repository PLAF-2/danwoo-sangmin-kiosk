import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useKioskApi } from '../../app/providers';

import { useCartStore } from '../../domain/cart/cartStore';
import type { CatalogData, Product } from '../../domain/contracts';
import { toKioskMediaUrl } from '../../services/kioskApi';

import './product-detail.css';

const fallbackImage = toKioskMediaUrl('images/horizon-keyring.svg');
const won = (amount: number) => `${new Intl.NumberFormat('ko-KR').format(amount)}원`;

function resolveProduct(catalog: CatalogData, productId: string | undefined) {
  const product = catalog.products.find(({ id }) => id === productId);
  if (!product) return { status: 'missing' as const };
  const activeCategoryIds = new Set(catalog.categories.filter(({ isActive }) => isActive).map(({ id }) => id));
  if (!product.isVisible || !activeCategoryIds.has(product.categoryId)) return { status: 'hidden' as const };
  return { status: 'ready' as const, product };
}

function ProductImage({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  return (
    <img
      alt={alt}
      className={className}
      onError={(event) => {
        if (event.currentTarget.src.endsWith('horizon-keyring.svg')) return;
        event.currentTarget.src = fallbackImage;
      }}
      src={toKioskMediaUrl(src)}
    />
  );
}

function StateMessage({ heading, detail }: { heading: string; detail: string }) {
  const navigate = useNavigate();
  return (
    <main className="product-detail-page product-detail-state">
      <section className="product-detail-card" aria-labelledby="product-state-heading">
        <h1 id="product-state-heading">{heading}</h1>
        <p>{detail}</p>
        <button onClick={() => navigate('/shop')} type="button">상품 목록으로</button>
      </section>
    </main>
  );
}

export function ProductDetailPage() {
  const api = useKioskApi();
  const { productId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const cart = useCartStore();
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [galleryIndex, setGalleryIndex] = useState(0);

  useEffect(() => {
    let active = true;
    void api.catalog.read().then((nextCatalog) => {
      if (active) setCatalog(nextCatalog);
    });
    return () => { active = false; };
  }, [api]);

  const result = useMemo(
    () => (catalog ? resolveProduct(catalog, productId) : null),
    [catalog, productId],
  );

  if (!result) return <main className="product-detail-page product-detail-state"><p>상품을 불러오는 중입니다.</p></main>;
  if (result.status === 'missing') return <StateMessage heading="상품을 찾을 수 없습니다." detail="요청한 상품이 존재하지 않습니다." />;
  if (result.status === 'hidden') return <StateMessage heading="현재 판매하지 않는 상품입니다." detail="상품 목록에서 판매 중인 상품을 확인해 주세요." />;

  const product: Product = result.product;
  const soldOut = product.saleStatus === 'soldOut';
  const images = [product.thumbnailImage, ...product.detailImages];

  function goBack() {
    navigate('/shop', { state: location.state });
  }

  function addToCart() {
    if (soldOut) return;
    cart.add(product, quantity);
    navigate('/shop', { state: location.state });
  }

  function buyNow() {
    if (soldOut) return;
    cart.add(product, quantity);
    navigate('/checkout');
  }

  return (
    <main className="product-detail-page">
      <header className="product-detail-header">
        <button aria-label="상품 목록으로" onClick={goBack} type="button">‹ 목록</button>
        <strong>HIGHEST</strong>
      </header>
      <section className="product-detail-card" aria-label="상품 상세">
        <div className="product-gallery" aria-label="상품 이미지 갤러리">
          <ProductImage alt={`${product.name} 이미지 ${galleryIndex + 1}`} className="product-detail-image" src={images[galleryIndex] ?? product.thumbnailImage} />
          <div className="product-gallery__controls">
            {images.map((image, index) => (
              <button
                aria-label={`상품 이미지 ${index + 1}`}
                aria-pressed={index === galleryIndex}
                className="product-gallery__dot"
                key={`${image}-${index}`}
                onClick={() => setGalleryIndex(index)}
                type="button"
              >
                <ProductImage alt="" src={image} />
              </button>
            ))}
          </div>
        </div>
        <div className="product-detail-copy">
          <p className="product-detail-eyebrow">CLOUD ACADEMY GOODS</p>
          <div className="product-detail-title-price" data-testid="product-title-price">
            <h1>{product.name}</h1>
            <strong className="product-detail-price">{won(product.price)}</strong>
          </div>
          {soldOut && <p className="product-detail-sold-out">품절</p>}
          <p>{product.description || '상품 설명이 준비 중입니다.'}</p>
          <dl className="product-specifications">
            {product.specifications.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
        </div>
        <div className="product-quantity">
          <span>수량</span>
          <button aria-label="수량 줄이기" disabled={quantity <= 1 || soldOut} onClick={() => setQuantity((value) => Math.max(1, value - 1))} type="button">−</button>
          <b data-testid="product-quantity">{quantity}</b>
          <button aria-label="수량 늘리기" disabled={quantity >= product.maxQuantity || soldOut} onClick={() => setQuantity((value) => Math.min(product.maxQuantity, value + 1))} type="button">+</button>
        </div>
        <div className="product-detail-total"><span>합계</span><strong data-testid="product-total">{won(product.price * quantity)}</strong></div>
        <div className="product-detail-actions">
          <button disabled={soldOut} onClick={addToCart} type="button">장바구니 담기</button>
          <button disabled={soldOut} onClick={buyNow} type="button">바로 구매</button>
        </div>
      </section>
    </main>
  );
}
