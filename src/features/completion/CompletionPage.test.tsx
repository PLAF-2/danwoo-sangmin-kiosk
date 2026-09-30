import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCartStore } from '../../domain/cart/cartStore';
import { useSessionStore } from '../../domain/session/sessionStore';
import { createAppSettings, createOrder, createPaymentSettings, createProduct } from '../../test/fixtures';
import { CompletionPage, displayOrderNumber } from './CompletionPage';

const read = vi.fn();

function LocationProbe() { return <div data-testid="location">{useLocation().pathname}</div>; }
function renderCompletion(orderNumber = '20260926-0001') {
  return render(<StrictMode><MemoryRouter initialEntries={[`/complete/${orderNumber}`]}><Routes>
    <Route element={<CompletionPage />} path="/complete/:orderNumber" />
    <Route element={<h1>웰컴</h1>} path="/" />
  </Routes><LocationProbe /></MemoryRouter></StrictMode>);
}
async function advance(milliseconds: number) { await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); }); }

describe('CompletionPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    read.mockReset().mockResolvedValue(createOrder());
    Object.defineProperty(window, 'kiosk', { configurable: true, value: { orders: { read }, settings: { read: vi.fn().mockResolvedValue(createAppSettings()), readPayment: vi.fn().mockResolvedValue(createPaymentSettings()) } } });
    useCartStore.getState().clear();
    useCartStore.getState().add(createProduct(), 1);
    useSessionStore.getState().reset();
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it.each([
    ['instant', '결제가 완료되었습니다'], ['bankQr', '주문이 접수되었습니다'], ['simulation', '결제 시뮬레이션이 완료되었습니다'],
  ] as const)('shows the %s result without creating another order', async (paymentMode, heading) => {
    read.mockResolvedValue(createOrder({ paymentMode, status: paymentMode === 'bankQr' ? 'received' : 'paid' }));
    renderCompletion(); await advance(0);
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    expect(screen.getByText(String(displayOrderNumber('20260926-0001')))).toBeInTheDocument();
    expect(screen.queryByText('20260926-0001')).not.toBeInTheDocument();
    expect(screen.getByText('25,000원')).toBeInTheDocument();
    expect(screen.getByText('카운터에서 주문 번호를 보여주세요.')).toBeInTheDocument();
    expect(read).toHaveBeenCalledWith('20260926-0001');
  });
  it('turns order ids into stable pickup numbers from 1 to 300', () => {
    const ids = Array.from({ length: 500 }, (_, index) => crypto.randomUUID?.() ?? `order-${index}`);
    const numbers = ids.map(displayOrderNumber);
    expect(numbers.every((number) => Number.isInteger(number) && number >= 1 && number <= 300)).toBe(true);
    expect(new Set(numbers).size).toBeGreaterThan(150);
    expect(displayOrderNumber(ids[0]!)).toBe(numbers[0]);
  });

  it('shows the designed image and the pickup number for a web order id', async () => {
    const orderNumber = '3d2aaca5-43e0-4e7b-8441-16c3f7fc3b21';
    read.mockResolvedValue(createOrder({ orderNumber }));
    renderCompletion(orderNumber); await advance(0);
    expect(screen.getByText(String(displayOrderNumber(orderNumber)))).toBeInTheDocument();
    expect(document.querySelector('.completion-background')).toHaveAttribute('src', '/images/complete-kiosk.webp');
  });
  it('shows a safe missing-order state that returns home', async () => {
    read.mockResolvedValue(null); renderCompletion('missing'); await advance(0);
    expect(screen.getByRole('heading', { name: '주문을 찾을 수 없습니다' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /처음으로/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/');
  });
  it('clears the cart only once when StrictMode enters an order completion', async () => {
    const clear = vi.spyOn(useCartStore.getState(), 'clear'); renderCompletion(); await advance(0);
    expect(screen.getByRole('heading', { name: '결제가 완료되었습니다' })).toBeInTheDocument();
    expect(clear).toHaveBeenCalledTimes(1);
  });
  it('shows the final five seconds and resets automatically at twenty seconds', async () => {
    renderCompletion(); await advance(0); expect(screen.getByRole('heading', { name: '결제가 완료되었습니다' })).toBeInTheDocument();
    expect(screen.queryByText(/초 후 처음 화면으로/)).not.toBeInTheDocument();
    await advance(15_000); expect(screen.getByText('5초 후 처음 화면으로 이동합니다.')).toBeInTheDocument();
    await advance(4_999); expect(screen.getByTestId('location')).toHaveTextContent('/complete/20260926-0001');
    await advance(1); expect(screen.getByTestId('location')).toHaveTextContent('/');
  });
  it('manually resets both cart and session before navigating home', async () => {
    renderCompletion(); await advance(0); expect(screen.getByRole('heading', { name: '결제가 완료되었습니다' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /처음으로/ }));
    expect(useCartStore.getState().itemCount()).toBe(0);
    expect(useSessionStore.getState().selectedCategoryId).toBeNull();
    expect(screen.getByTestId('location')).toHaveTextContent('/');
  });
});
