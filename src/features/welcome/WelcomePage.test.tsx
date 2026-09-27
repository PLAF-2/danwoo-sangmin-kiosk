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

function renderWelcome(settings = createAppSettings()) {
  Object.defineProperty(window, 'kiosk', {
    configurable: true,
    value: {
      settings: { read: vi.fn().mockResolvedValue(settings) },
    } as unknown as KioskApi,
  });

  const router = createAppMemoryRouter(['/']);
  render(<App router={router} />);
  return router;
}

describe('WelcomePage', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
    navigate.mockReset();
    useCartStore.getState().clear();
  });

  it('uses the configured welcome image with its focal position and scale', async () => {
    const router = renderWelcome(createAppSettings({
      welcomeBackgroundImage: 'images/custom-welcome.svg',
      welcomeImagePosition: { x: 32, y: 68 },
      welcomeImageScale: 1.4,
    }));

    const welcome = await screen.findByTestId('welcome-page');
    expect(welcome).toHaveStyle({
      backgroundImage: 'url("kiosk-media://images/custom-welcome.svg")',
      backgroundPosition: '32% 68%',
      backgroundSize: 'cover',
      transform: 'scale(1.4)',
    });

    router.dispose();
  });

  it('shows the configured message and honors logo visibility', async () => {
    const router = renderWelcome(createAppSettings({
      welcomeLogoVisible: false,
      welcomeMessage: '오늘의 HIGHEST를 만나보세요.',
    }));

    expect(await screen.findByText('오늘의 HIGHEST를 만나보세요.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'HIGHEST' })).not.toBeInTheDocument();

    router.dispose();
  });

  it('uses the safe default message when settings cannot be read', async () => {
    Object.defineProperty(window, 'kiosk', {
      configurable: true,
      value: { settings: { read: vi.fn().mockRejectedValue(new Error('offline')) } } as unknown as KioskApi,
    });
    const router = createAppMemoryRouter(['/']);
    render(<App router={router} />);

    expect(await screen.findByText('새로운 수평선을 만나보세요.')).toBeInTheDocument();

    router.dispose();
  });

  it('starts shopping without clearing the cart', async () => {
    useCartStore.getState().add(product);
    const router = renderWelcome();

    fireEvent.click(await screen.findByRole('button', { name: '굿즈 사러가기' }));

    expect(navigate).toHaveBeenCalledWith('/shop');
    expect(useCartStore.getState().itemCount()).toBe(1);
    router.dispose();
  });

  it('opens admin only after a long press', async () => {
    vi.useFakeTimers();
    const router = renderWelcome();
    const logo = screen.getByRole('button', { name: 'HIGHEST 관리자 진입' });

    fireEvent.pointerDown(logo);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(navigate).toHaveBeenCalledWith('/admin/login');
    router.dispose();
  });

  it('ignores a short press on the logo', async () => {
    const router = renderWelcome();
    const logo = screen.getByRole('button', { name: 'HIGHEST 관리자 진입' });

    fireEvent.pointerDown(logo);
    fireEvent.pointerUp(logo);

    expect(navigate).not.toHaveBeenCalled();
    router.dispose();
  });
});
