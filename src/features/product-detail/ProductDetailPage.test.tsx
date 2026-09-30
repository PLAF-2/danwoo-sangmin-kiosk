import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCartStore } from '../../domain/cart/cartStore';
import { createCatalogData, createProduct } from '../../test/fixtures';
import { ProductDetailPage } from './ProductDetailPage';

const product = createProduct({
  id: 'detail-product',
  name: '상세 상품',
  price: 12000,
  maxQuantity: 2,
  detailImages: ['images/detail-one.png', 'images/detail-two.png'],
  description: '상품 설명입니다.',
  specifications: [{ label: '크기', value: '45mm' }],
});

function renderPage(productId = product.id) {
  function LocationProbe() {
    return <output data-testid="location">{useLocation().pathname}</output>;
  }

  render(
    <MemoryRouter initialEntries={[`/products/${productId}`]}>
      <Routes>
        <Route path="/products/:productId" element={<ProductDetailPage />} />
        <Route path="/shop" element={<div>상품 목록</div>} />
        <Route path="/checkout" element={<div>결제</div>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('ProductDetailPage', () => {
  beforeEach(() => {
    useCartStore.getState().clear();
    Object.defineProperty(window, 'kiosk', {
      configurable: true,
      value: { catalog: { read: vi.fn().mockResolvedValue(createCatalogData({ products: [product] })) } },
    });
  });

  afterEach(() => cleanup());

  it('shows product details and calculates the selected total up to the maximum quantity', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: '상세 상품' })).toBeInTheDocument();
    expect(screen.getByText('상품 설명입니다.')).toBeInTheDocument();
    expect(screen.getByText('크기')).toBeInTheDocument();
    expect(screen.getByTestId('product-total')).toHaveTextContent('12,000원');

    fireEvent.click(screen.getByRole('button', { name: '수량 늘리기' }));
    fireEvent.click(screen.getByRole('button', { name: '수량 늘리기' }));

    expect(screen.getByTestId('product-quantity')).toHaveTextContent('2');
    expect(screen.getByTestId('product-total')).toHaveTextContent('24,000원');
  });

  it('groups the product name and price in a single detail row', async () => {
    renderPage();

    const summary = await screen.findByTestId('product-title-price');
    expect(summary).toContainElement(screen.getByRole('heading', { name: '상세 상품' }));
    expect(summary).toHaveTextContent('12,000원');
  });

  it('returns to the catalog after adding the selected quantity', async () => {
    Object.defineProperty(window, 'kiosk', {
      configurable: true,
      value: { catalog: { read: vi.fn().mockResolvedValue(createCatalogData({ products: [createProduct({ ...product, maxQuantity: 5 })] })) } },
    });
    renderPage();
    await screen.findByRole('heading', { name: '상세 상품' });

    fireEvent.click(screen.getByRole('button', { name: '수량 늘리기' }));
    fireEvent.click(screen.getByRole('button', { name: '장바구니 담기' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/shop');
    expect(useCartStore.getState().items['detail-product']?.quantity).toBe(2);
  });

  it('merges the selected quantity when buying now', async () => {
    renderPage();
    await screen.findByRole('heading', { name: '상세 상품' });
    fireEvent.click(screen.getByRole('button', { name: '수량 늘리기' }));
    fireEvent.click(screen.getByRole('button', { name: '바로 구매' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/checkout'));
    expect(useCartStore.getState().items['detail-product']?.quantity).toBe(2);
  });

  it('blocks sold-out products and explains unavailable products', async () => {
    Object.defineProperty(window, 'kiosk', {
      configurable: true,
      value: {
        catalog: {
          read: vi.fn().mockResolvedValue(createCatalogData({ products: [
            createProduct({ ...product, saleStatus: 'soldOut' }),
            createProduct({ ...product, id: 'hidden-product', isVisible: false }),
          ] })),
        },
      },
    });
    renderPage();
    expect(await screen.findByText('품절')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '장바구니 담기' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '바로 구매' })).toBeDisabled();

    cleanup();
    renderPage('missing-product');
    expect(await screen.findByRole('heading', { name: '상품을 찾을 수 없습니다.' })).toBeInTheDocument();
  });

  it('moves through every image with arrows and swipes, wrapping at both ends', async () => {
    // jsdom has no PointerEvent, so swipe coordinates would otherwise be dropped.
    vi.stubGlobal('PointerEvent', class extends MouseEvent {});
    renderPage();
    await screen.findByAltText('상세 상품 이미지 1');
    expect(screen.getByText('1 / 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '이전 이미지' }));
    expect(screen.getByAltText('상세 상품 이미지 3')).toHaveAttribute('src', '/images/detail-two.png');
    fireEvent.click(screen.getByRole('button', { name: '다음 이미지' }));
    expect(screen.getByText('1 / 3')).toBeInTheDocument();

    const stage = screen.getByAltText('상세 상품 이미지 1').parentElement!;
    fireEvent.pointerDown(stage, { clientX: 200 });
    fireEvent.pointerUp(stage, { clientX: 120 });
    expect(screen.getByAltText('상세 상품 이미지 2')).toHaveAttribute('src', '/images/detail-one.png');
    expect(screen.getByRole('button', { name: '상품 이미지 2' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.pointerDown(stage, { clientX: 200 });
    fireEvent.pointerUp(stage, { clientX: 190 });
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('hides the arrows when a product has a single image', async () => {
    Object.defineProperty(window, 'kiosk', {
      configurable: true,
      value: { catalog: { read: vi.fn().mockResolvedValue(createCatalogData({ products: [createProduct({ ...product, detailImages: [] })] })) } },
    });
    renderPage();
    await screen.findByAltText('상세 상품 이미지 1');
    expect(screen.queryByRole('button', { name: '다음 이미지' })).not.toBeInTheDocument();
  });

  it('uses the brand fallback when an image fails', async () => {
    renderPage();
    const image = await screen.findByAltText('상세 상품 이미지 1');
    fireEvent.error(image);
    expect(image).toHaveAttribute('src', expect.stringContaining('product-fallback'));
  });

  it('does not render decorative cloud chrome in the product header', async () => {
    renderPage();
    await screen.findByRole('heading', { name: '상세 상품' });

    expect(document.body.textContent).not.toContain('☁');
  });

  it('requires every option before adding and stores the chosen value in the cart', async () => {
    const set = createProduct({ id: 'set', name: '졸업 패키지', options: [{ name: '인형', values: ['단우', '상민'] }] });
    Object.defineProperty(window, 'kiosk', {
      configurable: true,
      value: { catalog: { read: vi.fn().mockResolvedValue(createCatalogData({ products: [set] })) } },
    });
    renderPage('set');

    expect(await screen.findByRole('button', { name: '장바구니 담기' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '바로 구매' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '상민' }));
    expect(screen.getByRole('button', { name: '상민' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '장바구니 담기' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/shop'));
    expect(Object.values(useCartStore.getState().items)).toEqual([
      { productId: 'set', quantity: 1, capturedUnitPrice: 25000, selectedOptions: [{ name: '인형', value: '상민' }] },
    ]);
  });
});

