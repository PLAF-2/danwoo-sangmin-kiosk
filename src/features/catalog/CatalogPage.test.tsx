import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCartStore } from '../../domain/cart/cartStore';
import { createCatalogData, createCategory, createProduct } from '../../test/fixtures';
import { CatalogPage } from './CatalogPage';

const catalog = createCatalogData({
  categories: [
    createCategory({ id: 'photobook', name: '포토북', displayOrder: 2 }),
    createCategory({ id: 'inactive', name: '비활성', isActive: false, displayOrder: 0 }),
    createCategory({ id: 'album', name: '앨범', displayOrder: 1 }),
    createCategory({ id: 'empty', name: '빈 카테고리', displayOrder: 3 }),
  ],
  products: [
    createProduct({ id: 'hidden', name: '숨김 상품', isVisible: false, displayOrder: 0 }),
    createProduct({ id: 'sold-out', name: '품절 상품', categoryId: 'album', saleStatus: 'soldOut', displayOrder: 1 }),
    createProduct({ id: 'album', name: '앨범 상품', categoryId: 'album', displayOrder: 2, price: 12_000 }),
    createProduct({ id: 'photobook', name: '포토북 상품', categoryId: 'photobook', displayOrder: 0, price: 24_000 }),
    createProduct({ id: 'orphan', name: '비활성 카테고리 상품', categoryId: 'inactive', displayOrder: 0 }),
  ],
});

function renderCatalog() {
  function LocationProbe() {
    return <output data-testid="location">{useLocation().pathname}</output>;
  }

  render(<MemoryRouter initialEntries={['/shop']}><CatalogPage /><LocationProbe /></MemoryRouter>);
}

describe('CatalogPage', () => {
  beforeEach(() => {
    useCartStore.getState().clear();
    Object.defineProperty(window, 'kiosk', {
      configurable: true,
      value: { catalog: { read: vi.fn().mockResolvedValue(catalog) } },
    });
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows active categories and visible products in display order, while leaving sold-out products visible', async () => {
    renderCatalog();

    expect(await screen.findByRole('button', { name: '전체' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '앨범' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '비활성' })).not.toBeInTheDocument();
    expect(screen.queryByText('숨김 상품')).not.toBeInTheDocument();
    expect(screen.queryByText('비활성 카테고리 상품')).not.toBeInTheDocument();
    expect(screen.getByText('품절 상품')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '품절 상품 담기' })).toBeDisabled();
    expect([...document.querySelectorAll('.product-card')].map((card) => card.textContent)).toEqual([
      expect.stringContaining('포토북 상품'),
      expect.stringContaining('품절 상품'),
      expect.stringContaining('앨범 상품'),
    ]);
  });

  it('filters products, adds without navigation, and routes cards and checkout', async () => {
    renderCatalog();
    await screen.findByText('앨범 상품');

    fireEvent.click(screen.getByRole('button', { name: '앨범' }));
    expect(screen.queryByText('포토북 상품')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '앨범 상품 담기' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/shop');
    expect(screen.getByText('총 1개')).toBeInTheDocument();
    expect(screen.getAllByText('12,000원')).toHaveLength(3);

    fireEvent.click(screen.getByTestId('product-card-album'));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/products/album'));
  });

  it('routes a non-empty cart to checkout', async () => {
    renderCatalog();
    await screen.findByText('앨범 상품');
    fireEvent.click(screen.getByRole('button', { name: '앨범 상품 담기' }));
    fireEvent.click(screen.getByRole('button', { name: '구매하러 가기' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/checkout'));
  });

  it('shows a fallback message for an active category without products', async () => {
    renderCatalog();
    await screen.findByText('앨범 상품');
    fireEvent.click(screen.getByRole('button', { name: '빈 카테고리' }));

    expect(screen.getByText('표시할 상품이 없습니다.')).toBeInTheDocument();
  });

  it('confirms removal at quantity one and returns home with the cart cleared', async () => {
    renderCatalog();
    await screen.findByText('앨범 상품');
    fireEvent.click(screen.getByRole('button', { name: '앨범 상품 담기' }));

    fireEvent.click(screen.getByRole('button', { name: '앨범 상품 수량 줄이기' }));
    expect(window.confirm).toHaveBeenCalled();
    expect(screen.getByText('장바구니가 비어 있습니다.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '처음으로' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/'));
  });

  it('keeps catalog scrolling hidden and cart scrolling visible, including an image fallback', async () => {
    renderCatalog();
    const image = await screen.findByAltText('포토북 상품');
    fireEvent.error(image);

    expect(image).toHaveAttribute('src', '');
    expect(screen.getByTestId('catalog-scroll')).toHaveClass('catalog-scroll');
    expect(screen.getByTestId('cart-scroll')).toHaveClass('cart-scroll');
  });
});
