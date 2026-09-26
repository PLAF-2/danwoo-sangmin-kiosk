import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAppRuntime } from '../app/bootstrap';
import { createAppMemoryRouter } from '../app/router';
import { App } from './App';

describe('App', () => {
  afterEach(cleanup);

  it('uses one bootstrap-created router through StrictMode remounts', () => {
    const router = createAppMemoryRouter(['/']);
    const routerFactory = vi.fn(() => router);
    const runtime = createAppRuntime(routerFactory);

    render(runtime.element);

    expect(screen.getByRole('heading', { name: 'HIGHEST Kiosk' })).toBeInTheDocument();
    expect(routerFactory).toHaveBeenCalledTimes(1);

    router.dispose();
  });

  it('renders with an explicitly supplied router', () => {
    const router = createAppMemoryRouter(['/']);

    render(<App router={router} />);

    expect(screen.getByRole('heading', { name: 'HIGHEST Kiosk' })).toBeInTheDocument();
    router.dispose();
  });
});
