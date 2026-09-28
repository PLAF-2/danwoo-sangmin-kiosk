import { cleanup, render, screen } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAppSettings, createCatalogData, createOrder, createPaymentSettings } from '../test/fixtures';
import { createAppMemoryRouter, createAppRouter } from './router';

const routeCases = [
  ['/shop', '내가 담은 굿즈'],
  ['/products/horizon-album', 'Product placeholder: horizon-album'],
  ['/checkout', '주문 내용을 확인해 주세요'],
  ['/complete/HK-20260926-001', '결제가 완료되었습니다'],
] as const;

const protectedAdminRoutes = [
  '/admin/products',
  '/admin/categories',
  '/admin/welcome',
  '/admin/payment',
  '/admin/system',
] as const;

describe('application router', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'kiosk', {
      configurable: true,
      value: {
        orders: { read: vi.fn().mockResolvedValue(createOrder({ orderNumber: 'HK-20260926-001' })) },
        catalog: { read: vi.fn().mockResolvedValue(createCatalogData()) },
        settings: {
          read: vi.fn().mockResolvedValue(createAppSettings()),
          readPayment: vi.fn().mockResolvedValue(createPaymentSettings()),
        },
      },
    });
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState(null, '', '/');
  });

  it.each(routeCases)('renders the page for %s', async (path, heading) => {
    const router = createAppMemoryRouter([path]);

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    router.dispose();
  });

  it('renders the welcome route', async () => {
    const router = createAppMemoryRouter(['/']);
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole('button', { name: '굿즈 사러가기' })).toBeInTheDocument();
    router.dispose();
  });

  it('redirects processing without state to checkout', async () => {
    const router = createAppMemoryRouter(['/processing']);

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('heading', { name: '주문 내용을 확인해 주세요' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/checkout');
    router.dispose();
  });

  it('renders the administrator login route', async () => {
    const router = createAppMemoryRouter(['/admin/login']);
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole('heading', { name: '관리자 로그인' })).toBeInTheDocument();
    router.dispose();
  });

  it.each(protectedAdminRoutes)('guards %s until authentication', async (path) => {
    const router = createAppMemoryRouter([path]);
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole('heading', { name: '관리자 로그인' })).toBeInTheDocument();
    router.dispose();
  });

  it('renders safe navigation for an unknown route', async () => {
    const router = createAppMemoryRouter(['/does-not-exist']);

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    const returnLink = screen.getByRole('link', { name: 'Return to start' });
    expect(returnLink).toHaveAttribute('href', '/');
    expect(returnLink).toHaveClass('touch-target');
    router.dispose();
  });

  it('loads the logical path from a packaged-style hash URL', async () => {
    window.history.replaceState(null, '', '/#/shop');
    const router = createAppRouter();

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('heading', { name: '내가 담은 굿즈' })).toBeInTheDocument();
    router.dispose();
  });
});
