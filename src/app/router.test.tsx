import { cleanup, render, screen } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCatalogData } from '../test/fixtures';
import { createAppMemoryRouter, createAppRouter } from './router';

const routeCases = [
  ['/', 'HIGHEST Kiosk'],
  ['/shop', '내가 담은 굿즈'],
  ['/products/horizon-album', 'Product placeholder: horizon-album'],
  ['/checkout', 'Checkout placeholder'],
  ['/processing', 'Processing placeholder'],
  ['/complete/HK-20260926-001', 'Order complete placeholder: HK-20260926-001'],
  ['/admin/login', 'Admin login placeholder'],
  ['/admin/products', 'Admin products placeholder'],
  ['/admin/categories', 'Admin categories placeholder'],
  ['/admin/welcome', 'Admin welcome placeholder'],
  ['/admin/payment', 'Admin payment placeholder'],
  ['/admin/system', 'Admin system placeholder'],
] as const;

describe('application router', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'kiosk', {
      configurable: true,
      value: { catalog: { read: vi.fn().mockResolvedValue(createCatalogData()) } },
    });
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState(null, '', '/');
  });

  it.each(routeCases)('renders the placeholder for %s', async (path, heading) => {
    const router = createAppMemoryRouter([path]);

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
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
