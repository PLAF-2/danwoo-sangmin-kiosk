import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    expect(screen.getByText('선택한 상품 1개')).toBeInTheDocument();
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

  it('keeps the cart dock hidden until something is added, then slides it open', async () => {
    renderCatalog();
    await screen.findByText('앨범 상품');
    const dock = screen.getByLabelText('내가 담은 굿즈');
    expect(dock).not.toHaveClass('cart-panel--open');
    expect(dock).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('region', { name: '내가 담은 굿즈' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '앨범 상품 담기' }));

    expect(screen.getByRole('region', { name: '내가 담은 굿즈' })).toHaveClass('cart-panel--dock', 'cart-panel--open');
    expect(screen.getByTestId('cart-scroll')).toHaveClass('cart-dock__items');
    expect(screen.getByRole('button', { name: '앨범 상품 수량 줄이기' })).toBeVisible();
    expect(screen.getByRole('button', { name: '앨범 상품 수량 늘리기' })).toBeVisible();
  });

  it('keeps every added product available in the scrollable cart list', async () => {
    renderCatalog();
    await screen.findByText('앨범 상품');

    fireEvent.click(screen.getByRole('button', { name: '앨범 상품 담기' }));
    fireEvent.click(screen.getByRole('button', { name: '포토북 상품 담기' }));

    expect(screen.getByTestId('cart-scroll')).toHaveClass('cart-dock__items--scrollable');
    expect(screen.getByRole('button', { name: '앨범 상품 수량 늘리기' })).toBeVisible();
    expect(screen.getByRole('button', { name: '포토북 상품 수량 늘리기' })).toBeVisible();
  });

  it('shows a fallback message for an active category without products', async () => {
    renderCatalog();
    await screen.findByText('앨범 상품');
    fireEvent.click(screen.getByRole('button', { name: '빈 카테고리' }));

    expect(screen.getByText('표시할 상품이 없습니다.')).toBeInTheDocument();
  });

  it('removes the last item without asking and returns home with the cart cleared', async () => {
    renderCatalog();
    await screen.findByText('앨범 상품');
    fireEvent.click(screen.getByRole('button', { name: '앨범 상품 담기' }));

    fireEvent.click(screen.getByRole('button', { name: '앨범 상품 수량 줄이기' }));
    expect(window.confirm).not.toHaveBeenCalled();
    const dock = screen.getByLabelText('내가 담은 굿즈');
    expect(dock).not.toHaveClass('cart-panel--open');
    // The last contents stay visible while the dock slides away instead of flashing an empty cart.
    expect(dock).toHaveTextContent('선택한 상품 1개');

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

  it('asks for every option before adding and keeps each choice on its own cart line', async () => {
    window.kiosk.catalog.read = vi.fn().mockResolvedValue(createCatalogData({
      categories: [createCategory({ id: 'sets', name: '세트' })],
      products: [createProduct({
        id: 'graduation',
        name: '졸업 패키지',
        categoryId: 'sets',
        price: 60_000,
        maxQuantity: 2,
        options: [{ name: '인형', values: ['단우', '상민'] }],
      })],
    }));
    renderCatalog();
    fireEvent.click(await screen.findByRole('button', { name: '졸업 패키지 담기' }));

    const dialog = screen.getByRole('dialog', { name: '졸업 패키지' });
    expect(within(dialog).getByRole('button', { name: '장바구니에 담기' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('내가 담은 굿즈')).not.toHaveClass('cart-panel--open');

    for (const member of ['단우', '상민']) {
      fireEvent.click(screen.getByRole('button', { name: '졸업 패키지 담기' }));
      fireEvent.click(screen.getByRole('button', { name: member }));
      fireEvent.click(screen.getByRole('button', { name: '장바구니에 담기' }));
    }

    expect(screen.getByText('인형: 단우')).toBeInTheDocument();
    expect(screen.getByText('인형: 상민')).toBeInTheDocument();
    expect(screen.getByText('선택한 상품 2개')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '졸업 패키지 (인형: 단우) 수량 늘리기' }));
    expect(screen.getByText('선택한 상품 2개')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '졸업 패키지 (인형: 상민) 수량 줄이기' }));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(screen.queryByText('인형: 상민')).not.toBeInTheDocument();
    expect(screen.getByText('인형: 단우')).toBeInTheDocument();
  });
});
