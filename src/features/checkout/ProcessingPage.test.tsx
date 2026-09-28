import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCartStore } from '../../domain/cart/cartStore';
import type { CreateOrderInput, Order } from '../../domain/contracts';
import { createCartItem, createOrder, createPaymentSettings, createProduct } from '../../test/fixtures';
import { ProcessingPage, type ProcessingState } from './ProcessingPage';

const create = vi.fn<(input: CreateOrderInput) => Promise<Order>>();
const requestId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const retryRequestId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const processingState = (overrides: Partial<ProcessingState> = {}): ProcessingState => ({
  items: [createCartItem({ quantity: 2 })], payment: createPaymentSettings(), requestId, ...overrides,
});

function LocationProbe() {
  const location = useLocation();
  const navigationType = useNavigationType();
  return <><div data-testid="location">{location.pathname}</div><div data-testid="request-state">{JSON.stringify(location.state)}</div><div data-testid="navigation-type">{navigationType}</div></>;
}

function renderProcessing(state: unknown = processingState()) {
  return render(<StrictMode><MemoryRouter initialEntries={[{ pathname: '/processing', state }]}>
    <Routes>
      <Route element={<ProcessingPage />} path="/processing" />
      <Route element={<h1>주문 확인</h1>} path="/checkout" />
      <Route element={<h1>장바구니</h1>} path="/shop" />
      <Route element={<h1>주문 결과</h1>} path="/complete/:orderNumber" />
    </Routes>
    <LocationProbe />
  </MemoryRouter></StrictMode>);
}

async function advance(milliseconds: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
}

describe('ProcessingPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    create.mockReset().mockResolvedValue(createOrder());
    Object.defineProperty(window, 'kiosk', { configurable: true, value: { orders: { create } } });
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(retryRequestId);
    useCartStore.getState().clear();
    useCartStore.getState().add(createProduct(), 2);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each([1, 3, 5])('waits the full %s seconds and creates exactly once under StrictMode', async (processingSeconds) => {
    const state = processingState({ payment: createPaymentSettings({ processingSeconds }) });
    const cart = useCartStore.getState().items;
    renderProcessing(state);
    expect(screen.getByRole('heading', { name: '결제를 처리하고 있어요' })).toBeInTheDocument();
    expect(screen.getByText('HIGHEST')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveClass('processing-page');
    expect(create).not.toHaveBeenCalled();
    await advance(processingSeconds * 1000 - 1);
    expect(create).not.toHaveBeenCalled();
    await advance(1);
    expect(create).toHaveBeenCalledExactlyOnceWith({ requestId, items: state.items, expectedPayment: state.payment });
    await advance(10_000);
    expect(create).toHaveBeenCalledTimes(1);
    expect(useCartStore.getState().items).toBe(cart);
  });

  it.each(['paid', 'received'] as const)('replace-navigates a %s order to its encoded completion URL', async (status) => {
    const orderNumber = '주문 /#? 1';
    create.mockResolvedValue(createOrder({ status, orderNumber }));
    renderProcessing();
    await advance(3000);
    expect(screen.getByTestId('location')).toHaveTextContent(`/complete/${encodeURIComponent(orderNumber)}`);
    expect(screen.getByTestId('navigation-type')).toHaveTextContent('REPLACE');
  });

  it('shows failed simulation actions and retries once with a fresh requestId and full delay', async () => {
    create.mockResolvedValueOnce(createOrder({ status: 'failed', paymentMode: 'simulation' }));
    const state = processingState({ payment: createPaymentSettings({ mode: 'simulation', simulationResult: 'failure' }) });
    renderProcessing(state);
    expect(screen.getByRole('heading', { name: '결제를 처리하고 있어요' })).toBeInTheDocument();
    expect(screen.queryByText('결제 시뮬레이션에 실패했습니다')).not.toBeInTheDocument();
    await advance(3000);
    expect(screen.getByRole('heading', { name: '결제 시뮬레이션에 실패했습니다' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '장바구니로' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('navigation-type')).toHaveTextContent('REPLACE');
    expect(JSON.parse(screen.getByTestId('request-state').textContent!)).toEqual({ ...state, requestId: retryRequestId });
    expect(screen.getByRole('heading', { name: '결제를 처리하고 있어요' })).toBeInTheDocument();
    await advance(2999);
    expect(create).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenLastCalledWith({ requestId: retryRequestId, items: state.items, expectedPayment: state.payment });
    expect(screen.getByTestId('location')).toHaveTextContent('/complete/20260926-0001');
  });

  it('returns review-required rejections to checkout without retrying', async () => {
    create.mockRejectedValueOnce(new Error('ORDER_REVIEW_REQUIRED: Product price changed'));
    renderProcessing();
    await advance(3000);
    expect(screen.getByTestId('location')).toHaveTextContent('/checkout');
    expect(screen.getByTestId('navigation-type')).toHaveTextContent('REPLACE');
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument();
    await advance(10_000);
    expect(create).toHaveBeenCalledTimes(1);
    expect(crypto.randomUUID).not.toHaveBeenCalled();
  });

  it.each(['rejected', 'thrown'] as const)('retries %s creation with the same requestId after the full delay', async (failure) => {
    if (failure === 'rejected') create.mockRejectedValueOnce(new Error('Unable to persist order'));
    else create.mockImplementationOnce(() => { throw new Error('Unable to persist order'); });
    renderProcessing();
    await advance(3000);
    expect(screen.getByRole('alert')).toHaveTextContent('주문을 저장하지 못했습니다. 다시 시도해 주세요.');
    expect(screen.queryByRole('button', { name: '장바구니로' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(crypto.randomUUID).not.toHaveBeenCalled();
    expect(JSON.parse(screen.getByTestId('request-state').textContent!)).toEqual(processingState());
    expect(screen.getByTestId('navigation-type')).toHaveTextContent('REPLACE');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await advance(2999);
    expect(create).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenLastCalledWith({ requestId, items: processingState().items, expectedPayment: processingState().payment });
    expect(screen.getByTestId('location')).toHaveTextContent('/complete/20260926-0001');
    await advance(10_000);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('returns to the shop without clearing the cart', async () => {
    create.mockResolvedValue(createOrder({ status: 'failed' }));
    const cart = useCartStore.getState().items;
    renderProcessing();
    await advance(3000);
    fireEvent.click(screen.getByRole('button', { name: '장바구니로' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/shop');
    expect(useCartStore.getState().items).toBe(cart);
    await advance(10_000);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it.each([
    null, {}, { ...processingState(), items: [] },
    { ...processingState(), requestId: '' },
    { ...processingState(), payment: { ...createPaymentSettings(), processingSeconds: -1 } },
  ])('replace-redirects unusable state to checkout: %j', async (state) => {
    renderProcessing(state);
    expect(screen.getByTestId('location')).toHaveTextContent('/checkout');
    expect(screen.getByTestId('navigation-type')).toHaveTextContent('REPLACE');
    expect(screen.queryByRole('heading', { name: /처리하고|접수하고/ })).not.toBeInTheDocument();
    await advance(10_000);
    expect(create).not.toHaveBeenCalled();
  });

  it('uses receipt wording for bankQr waiting and failure without claiming payment completion', async () => {
    create.mockResolvedValue(createOrder({ status: 'failed', paymentMode: 'bankQr' }));
    renderProcessing(processingState({ payment: createPaymentSettings({
      mode: 'bankQr', bankName: '구름은행', accountNumber: '123-456', accountHolder: '하이스트', qrImage: 'images/bank-qr.png',
    }) }));
    expect(screen.getByRole('heading', { name: '주문을 접수하고 있어요' })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('결제 완료');
    await advance(3000);
    expect(screen.getByRole('heading', { name: '주문 접수에 실패했습니다' })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('결제 완료');
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });

  it('cancels its timer when unmounted before the duration', async () => {
    const view = renderProcessing();
    await advance(2999);
    view.unmount();
    await advance(10_000);
    expect(create).not.toHaveBeenCalled();
  });

  it.each(['paid', 'failed', 'rejected'] as const)('ignores a %s promise continuation after unmount', async (status) => {
    let resolve!: (order: Order) => void;
    let reject!: (reason: Error) => void;
    create.mockReturnValue(new Promise<Order>((yes, no) => { resolve = yes; reject = no; }));
    function RemovableProcessing({ visible }: { visible: boolean }) {
      return <MemoryRouter initialEntries={[{ pathname: '/processing', state: processingState() }]}>
        {visible && <ProcessingPage />}
        <LocationProbe />
      </MemoryRouter>;
    }
    const view = render(<RemovableProcessing visible />);
    await advance(3000);
    expect(create).toHaveBeenCalledTimes(1);
    view.rerender(<RemovableProcessing visible={false} />);
    await act(async () => {
      if (status === 'rejected') reject(new Error('Persistence failed'));
      else resolve(createOrder({ status }));
    });
    expect(screen.getByTestId('location')).toHaveTextContent('/processing');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
