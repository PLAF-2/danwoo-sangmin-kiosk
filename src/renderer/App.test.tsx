import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAppRuntime } from '../app/bootstrap';
import { createAppMemoryRouter } from '../app/router';
import { createAppSettings, createCatalogData, createPaymentSettings } from '../test/fixtures';
import { createWebKioskApi } from '../services/webKioskApi';
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

  it('uses the injected web API instead of the window test double', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => new Response(JSON.stringify(
      url === '/api/settings' ? createAppSettings() : createCatalogData(),
    )));
    const router = createAppMemoryRouter(['/shop']);
    render(<App api={createWebKioskApi(fetcher)} router={router} />);
    expect(await screen.findByText('HORIZON Album')).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith('/api/catalog', expect.objectContaining({ credentials: 'include' }));
    expect(window.kiosk.catalog.read).not.toHaveBeenCalled();
    router.dispose();
  });
});
