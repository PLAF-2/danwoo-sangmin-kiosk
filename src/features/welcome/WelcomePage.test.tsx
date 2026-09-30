import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../app/App';
import { createAppMemoryRouter } from '../../app/router';
import { useCartStore } from '../../domain/cart/cartStore';
import type { Product } from '../../domain/contracts';
import { type KioskApi } from '../../services/kioskApi';
import { createAppSettings } from '../../test/fixtures';

const navigate = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

const product = {
  id: 'welcome-test-product',
  price: 12_000,
  maxQuantity: 3,
} satisfies Pick<Product, 'id' | 'price' | 'maxQuantity'>;

function renderWelcome() {
  const read = vi.fn().mockResolvedValue(createAppSettings());
  Object.defineProperty(window, 'kiosk', {
    configurable: true,
    value: { settings: { read } } as unknown as KioskApi,
  });

  const router = createAppMemoryRouter(['/']);
  render(<App router={router} />);
  return { router, read };
}

describe('WelcomePage', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
    navigate.mockReset();
    useCartStore.getState().clear();
  });

  it('shows the shipped welcome image on the first render with only the start button', () => {
    const { router } = renderWelcome();

    expect(screen.getByTestId('welcome-page')).toHaveAttribute('src', '/images/welcome-kiosk.webp');
    expect(screen.getByRole('button', { name: '굿즈 사러가기' })).toBeInTheDocument();
    expect(screen.queryByText('HIGHEST')).not.toBeInTheDocument();
    router.dispose();
  });

  it('starts shopping without clearing the cart', async () => {
    useCartStore.getState().add(product);
    const { router } = renderWelcome();

    fireEvent.click(await screen.findByRole('button', { name: '굿즈 사러가기' }));

    expect(navigate).toHaveBeenCalledWith('/shop');
    expect(useCartStore.getState().itemCount()).toBe(1);
    router.dispose();
  });

  it('opens admin after a long press on the hidden corner control', async () => {
    vi.useFakeTimers();
    const { router } = renderWelcome();
    const hotspot = screen.getByRole('button', { name: '관리자 진입' });

    fireEvent.pointerDown(hotspot);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(navigate).toHaveBeenCalledWith('/admin/login');
    router.dispose();
  });

  it('ignores a short press on the corner control', () => {
    const { router } = renderWelcome();
    const hotspot = screen.getByRole('button', { name: '관리자 진입' });

    fireEvent.pointerDown(hotspot);
    fireEvent.pointerUp(hotspot);

    expect(navigate).not.toHaveBeenCalled();
    router.dispose();
  });
});
