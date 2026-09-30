import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCartStore } from '../cart/cartStore';
import { createAppSettings, createProduct } from '../../test/fixtures';
import { CustomerSessionBoundary } from './CustomerSessionBoundary';

function Probe() { return <div data-testid="location">{useLocation().pathname}</div>; }
function renderRoute(path = '/shop') {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route element={<CustomerSessionBoundary />} path="/*"><Route element={<h1>고객</h1>} path="*" /></Route>
  </Routes><Probe /></MemoryRouter>);
}
async function advance(time: number) { await act(async () => { await vi.advanceTimersByTimeAsync(time); }); }

describe('CustomerSessionBoundary', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'kiosk', { configurable: true, value: { settings: { read: vi.fn().mockResolvedValue(createAppSettings()) } } });
    useCartStore.getState().clear(); useCartStore.getState().add(createProduct());
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it('warns after 75 seconds, then clears and returns home after 90 seconds', async () => {
    renderRoute(); await advance(0); await advance(75_000);
    expect(screen.getByRole('dialog', { name: '아직 이용 중이신가요?' })).toHaveTextContent('15초 후 처음 화면으로 이동합니다.');
    await advance(5_000);
    expect(screen.getByRole('dialog')).toHaveTextContent('10초 후 처음 화면으로 이동합니다.');
    await advance(10_000);
    expect(useCartStore.getState().itemCount()).toBe(0);
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await advance(120_000);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('restarts the timer when the customer continues', async () => {
    renderRoute(); await advance(0); await advance(75_000); fireEvent.click(screen.getByRole('button', { name: '계속 이용하기' }));
    await advance(74_999); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await advance(1); expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  it('does not idle-reset the welcome, processing or admin paths', async () => {
    const welcome = renderRoute('/'); await advance(0); await advance(120_000);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(useCartStore.getState().itemCount()).toBe(1);
    welcome.unmount();
    const view = renderRoute('/processing'); await advance(0); await advance(120_000);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(useCartStore.getState().itemCount()).toBe(1);
    view.unmount(); renderRoute('/admin/products'); await advance(0); await advance(120_000);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(useCartStore.getState().itemCount()).toBe(1);
  });
});
