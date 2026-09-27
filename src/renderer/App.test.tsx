import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAppRuntime } from '../app/bootstrap';
import { createAppMemoryRouter } from '../app/router';
import { createAppSettings, createCatalogData, createPaymentSettings } from '../test/fixtures';
import { App } from './App';

describe('App', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'kiosk', {
      configurable: true,
      value: {
        catalog: { read: vi.fn().mockResolvedValue(createCatalogData()) },
        settings: {
          read: vi.fn().mockResolvedValue(createAppSettings()),
          readPayment: vi.fn().mockResolvedValue(createPaymentSettings()),
        },
      },
    });
  });

  afterEach(cleanup);

  it('uses one bootstrap-created router through StrictMode remounts', async () => {
    const router = createAppMemoryRouter(['/']);
    const routerFactory = vi.fn(() => router);
    const runtime = createAppRuntime(routerFactory);

    render(runtime.element);

    expect(await screen.findByRole('button', { name: '굿즈 사러가기' })).toBeInTheDocument();
    expect(routerFactory).toHaveBeenCalledTimes(1);

    router.dispose();
  });

  it('renders with an explicitly supplied router', async () => {
    const router = createAppMemoryRouter(['/']);

    render(<App router={router} />);

    expect(await screen.findByRole('button', { name: '굿즈 사러가기' })).toBeInTheDocument();
    router.dispose();
  });
});
