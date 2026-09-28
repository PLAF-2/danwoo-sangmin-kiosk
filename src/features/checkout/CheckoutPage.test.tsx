import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCartStore } from '../../domain/cart/cartStore';
import type { CatalogData, PaymentSettings } from '../../domain/contracts';
import { createCartItem, createCatalogData, createPaymentSettings, createProduct } from '../../test/fixtures';
import { CheckoutPage } from './CheckoutPage';

const catalogRead = vi.fn<() => Promise<CatalogData>>();
const paymentRead = vi.fn<() => Promise<PaymentSettings>>();
const requestId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function renderCheckout() {
  function LocationProbe() {
    const location = useLocation();
    return <><div data-testid="location">{location.pathname}</div><div data-testid="request-state">{JSON.stringify(location.state)}</div></>;
  }
  render(<MemoryRouter initialEntries={['/checkout']}><CheckoutPage /><LocationProbe /></MemoryRouter>);
}

async function ready() {
  return screen.findByRole('button', { name: '결제하기' });
}

describe('CheckoutPage', () => {
  beforeEach(() => {
    useCartStore.getState().clear();
    useCartStore.getState().add(createProduct(), 2);
    catalogRead.mockReset().mockResolvedValue(createCatalogData());
    paymentRead.mockReset().mockResolvedValue(createPaymentSettings());
    Object.defineProperty(window, 'kiosk', { configurable: true, value: {
      catalog: { read: catalogRead }, settings: { readPayment: paymentRead },
    } });
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(requestId);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows cart rows and totals in separate scrolling and fixed sections', async () => {
    renderCheckout();
    await ready();
    expect(screen.getByRole('heading', { name: '주문 내용을 확인해 주세요' })).toBeInTheDocument();
    const items = screen.getByTestId('checkout-items');
    const fixed = screen.getByTestId('checkout-fixed');
    expect(items).toHaveClass('checkout-items');
    expect(fixed).toHaveClass('checkout-fixed');
    expect(items.parentElement).toBe(fixed.parentElement);
    expect(within(items).getByText('HORIZON Album')).toBeInTheDocument();
    expect(within(items).getByText('수량 2개')).toBeInTheDocument();
    expect(within(items).getByText('50,000원')).toBeInTheDocument();
    expect(within(items).getByAltText('HORIZON Album')).toHaveAttribute('src', 'kiosk-media://images/horizon-album.png');
    expect(within(fixed).getByText('상품 금액')).toBeInTheDocument();
    expect(within(fixed).getByText('할인')).toBeInTheDocument();
    expect(within(fixed).getByText('0원')).toBeInTheDocument();
    expect(within(fixed).getAllByText('50,000원')).toHaveLength(2);
    expect(within(fixed).getByRole('button', { name: '결제하기' })).toBeInTheDocument();
  });

  it('displays current catalog prices when captured cart prices are older', async () => {
    catalogRead.mockResolvedValue(createCatalogData({ products: [createProduct({ price: 30_000 })] }));
    renderCheckout();
    await ready();
    expect(within(screen.getByTestId('checkout-items')).getByText('60,000원')).toBeInTheDocument();
    expect(within(screen.getByTestId('checkout-fixed')).getAllByText('60,000원')).toHaveLength(2);
    expect(screen.queryByText('50,000원')).not.toBeInTheDocument();
    expect(useCartStore.getState().items['horizon-album']?.capturedUnitPrice).toBe(25_000);
  });

  it('requires confirmation when the displayed discount returns to the captured price on the first click', async () => {
    catalogRead.mockResolvedValueOnce(createCatalogData({ products: [createProduct({ price: 20_000 })] }));
    renderCheckout();
    const button = await ready();
    expect(within(screen.getByTestId('checkout-fixed')).getAllByText('40,000원')).toHaveLength(2);
    await act(async () => { fireEvent.click(button); });
    expect(screen.getByTestId('location')).toHaveTextContent('/checkout');
    expect(within(screen.getByTestId('checkout-items')).getByText('50,000원')).toBeInTheDocument();
    expect(within(screen.getByTestId('checkout-fixed')).getAllByText('50,000원')).toHaveLength(2);
    expect(screen.getByRole('alert')).toHaveTextContent(/가격.*변경/);
    expect(screen.getByText('20,000원 → 25,000원')).toBeInTheDocument();
    expect(crypto.randomUUID).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '변경 금액 확인하고 계속' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/processing'));
    expect(catalogRead).toHaveBeenCalledTimes(3);
    expect(paymentRead).toHaveBeenCalledTimes(3);
    expect(useCartStore.getState().items['horizon-album']?.capturedUnitPrice).toBe(25_000);
  });

  it('disables submission for an empty cart', async () => {
    useCartStore.getState().clear();
    renderCheckout();
    expect(await ready()).toBeDisabled();
    expect(screen.getByText('장바구니가 비어 있습니다.')).toBeInTheDocument();
  });

  it.each(['← 장바구니', '주문 수정하기'])('returns to the shop with %s without changing the cart', async (label) => {
    const items = useCartStore.getState().items;
    renderCheckout();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(screen.getByTestId('location')).toHaveTextContent('/shop');
    expect(useCartStore.getState().items).toBe(items);
  });

  it.each([
    ['instant', '결제하기'], ['bankQr', '입금했어요'], ['simulation', '결제 시뮬레이션'],
  ] as const)('uses the configured %s action', async (mode, label) => {
    paymentRead.mockResolvedValue(createPaymentSettings({
      mode, bankName: '구름은행', accountNumber: '123-456-789', accountHolder: '하이스트', qrImage: 'images/bank-qr.png',
    }));
    renderCheckout();
    expect(await screen.findByRole('button', { name: label })).toBeEnabled();
    for (const other of ['결제하기', '입금했어요', '결제 시뮬레이션'].filter((value) => value !== label)) {
      expect(screen.queryByRole('button', { name: other })).not.toBeInTheDocument();
    }
  });

  it.each([
    ['instant', '결제하기', 'simulation', '결제 시뮬레이션'],
    ['simulation', '결제 시뮬레이션', 'instant', '즉시 완료'],
  ] as const)('shows the new payment mode after a %s checkout changes', async (from, action, to, label) => {
    paymentRead.mockResolvedValue(createPaymentSettings({ mode: from }));
    renderCheckout();
    const button = await screen.findByRole('button', { name: action });
    paymentRead.mockResolvedValue(createPaymentSettings({ mode: to }));
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent(/결제 안내.*변경/);
    expect(within(screen.getByTestId('checkout-fixed')).getByText(label)).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/checkout');
  });

  it('shows bank details, QR and explicit operator confirmation without claiming payment completion', async () => {
    paymentRead.mockResolvedValue(createPaymentSettings({
      mode: 'bankQr', bankName: '구름은행', accountNumber: '123-456-789', accountHolder: '하이스트',
      qrImage: 'images/bank-qr.png', instructionText: 'QR을 스캔하고 입금해 주세요.',
    }));
    renderCheckout();
    await screen.findByRole('button', { name: '입금했어요' });
    for (const text of ['구름은행', '123-456-789', '하이스트', 'QR을 스캔하고 입금해 주세요.']) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.getByAltText('입금 QR 코드')).toHaveAttribute('src', 'kiosk-media://images/bank-qr.png');
    expect(screen.getByText(/운영자.*입금.*확인/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('결제 완료');
  });

  it('requires confirmation when payment mode changes before submission', async () => {
    renderCheckout();
    const button = await ready();
    const bankPayment = createPaymentSettings({
      mode: 'bankQr', bankName: '구름은행', accountNumber: '123-456', accountHolder: '하이스트',
      qrImage: 'images/bank-qr.png', instructionText: 'QR을 스캔하고 입금해 주세요.',
    });
    paymentRead.mockResolvedValue(bankPayment);
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent(/결제 안내.*변경/);
    expect(screen.getByTestId('location')).toHaveTextContent('/checkout');
    expect(screen.getByText('구름은행')).toBeInTheDocument();
    expect(screen.getByText('123-456')).toBeInTheDocument();
    expect(screen.getByText('하이스트')).toBeInTheDocument();
    expect(screen.getByAltText('입금 QR 코드')).toHaveAttribute('src', 'kiosk-media://images/bank-qr.png');
    expect(screen.getByText('QR을 스캔하고 입금해 주세요.')).toBeInTheDocument();
    expect(screen.getByText(/운영자.*입금.*확인/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('결제 완료');
    expect(crypto.randomUUID).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '변경된 결제 안내 확인하고 계속' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/processing'));
    expect(JSON.parse(screen.getByTestId('request-state').textContent!)).toEqual({
      items: [createCartItem({ quantity: 2 })], payment: bankPayment, requestId,
    });
    expect(useCartStore.getState().items['horizon-album']?.capturedUnitPrice).toBe(25_000);
    expect(paymentRead).toHaveBeenCalledTimes(3);
  });

  it('requires another confirmation when bank account details change again', async () => {
    const bank = createPaymentSettings({
      mode: 'bankQr', bankName: '구름은행', accountNumber: '111', accountHolder: '하이스트', qrImage: 'images/bank-qr.png',
    });
    paymentRead.mockResolvedValue(bank);
    renderCheckout();
    const button = await screen.findByRole('button', { name: '입금했어요' });
    const next = { ...bank, accountNumber: '222' };
    paymentRead.mockResolvedValue(next);
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent(/결제 안내.*변경/);
    expect(screen.getByText('222')).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: '변경된 결제 안내 확인하고 계속' });
    const changedAgain = { ...next, accountNumber: '333', instructionText: '새 계좌로 입금해 주세요.' };
    paymentRead.mockResolvedValue(changedAgain);
    fireEvent.click(confirm);
    expect(await screen.findByText('333')).toBeInTheDocument();
    expect(screen.getByText('새 계좌로 입금해 주세요.')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/checkout');
    expect(crypto.randomUUID).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '변경된 결제 안내 확인하고 계속' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/processing'));
    expect(JSON.parse(screen.getByTestId('request-state').textContent!)).toMatchObject({ payment: changedAgain });
    expect(paymentRead).toHaveBeenCalledTimes(4);
  });

  it.each([
    ['sold-out', createCatalogData({ products: [createProduct({ saleStatus: 'soldOut' })] })],
    ['hidden', createCatalogData({ products: [createProduct({ isVisible: false })] })],
    ['deleted', createCatalogData({ products: [] })],
    ['above maximum', createCatalogData({ products: [createProduct({ maxQuantity: 1 })] })],
  ])('blocks %s items using the current catalog and releases the submission lock', async (_, latestCatalog) => {
    renderCheckout();
    const button = await ready();
    catalogRead.mockResolvedValueOnce(latestCatalog);
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent(/판매할 수 없습니다|최대 1개/);
    expect(screen.getByTestId('location')).toHaveTextContent('/checkout');
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/processing'));
    expect(useCartStore.getState().itemCount()).toBe(2);
  });

  it('requires an explicit second click for changed prices and payment settings', async () => {
    renderCheckout();
    const button = await ready();
    const latestPayment = createPaymentSettings({ mode: 'simulation' });
    catalogRead.mockResolvedValue(createCatalogData({ products: [createProduct({ price: 30_000 })] }));
    paymentRead.mockResolvedValue(latestPayment);
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent(/가격.*변경/);
    expect(screen.getByTestId('location')).toHaveTextContent('/checkout');
    expect(within(screen.getByTestId('checkout-items')).getByText('25,000원 → 30,000원')).toBeInTheDocument();
    expect(within(screen.getByTestId('checkout-fixed')).getAllByText('60,000원')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '변경 내용 확인하고 계속' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/processing'));
    expect(JSON.parse(screen.getByTestId('request-state').textContent!)).toEqual({
      items: [createCartItem({ quantity: 2, capturedUnitPrice: 30_000 })], payment: latestPayment, requestId,
    });
    expect(useCartStore.getState().items['horizon-album']?.capturedUnitPrice).toBe(25_000);
  });

  it('requires confirmation again if the price changes after the first confirmation', async () => {
    renderCheckout();
    const button = await ready();
    catalogRead.mockResolvedValueOnce(createCatalogData({ products: [createProduct({ price: 30_000 })] }));
    fireEvent.click(button);
    const confirm = await screen.findByRole('button', { name: '변경 금액 확인하고 계속' });
    catalogRead.mockResolvedValue(createCatalogData({ products: [createProduct({ price: 35_000 })] }));
    fireEvent.click(confirm);
    await screen.findByText('30,000원 → 35,000원');
    expect(screen.getByTestId('location')).toHaveTextContent('/checkout');
    fireEvent.click(confirm);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/processing'));
    expect(catalogRead).toHaveBeenCalledTimes(4);
  });

  it('requires renewed confirmation when the price returns to the captured price', async () => {
    renderCheckout();
    const button = await ready();
    catalogRead.mockResolvedValueOnce(createCatalogData({ products: [createProduct({ price: 30_000 })] }));
    fireEvent.click(button);
    const confirm = await screen.findByRole('button', { name: '변경 금액 확인하고 계속' });
    await act(async () => { fireEvent.click(confirm); });
    expect(screen.getByTestId('location')).toHaveTextContent('/checkout');
    expect(within(screen.getByTestId('checkout-items')).getByText('50,000원')).toBeInTheDocument();
    expect(within(screen.getByTestId('checkout-fixed')).getAllByText('50,000원')).toHaveLength(2);
    expect(screen.queryByText('25,000원 → 30,000원')).not.toBeInTheDocument();
    expect(screen.getByText('30,000원 → 25,000원')).toBeInTheDocument();
    expect(confirm).toBeEnabled();
    expect(crypto.randomUUID).not.toHaveBeenCalled();
    fireEvent.click(confirm);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/processing'));
    expect(catalogRead).toHaveBeenCalledTimes(4);
    expect(paymentRead).toHaveBeenCalledTimes(4);
  });

  it('locks synchronously so rapid clicks produce one reread and one request', async () => {
    renderCheckout();
    const button = await ready();
    let resolveCatalog!: (catalog: CatalogData) => void;
    catalogRead.mockImplementationOnce(() => new Promise((resolve) => { resolveCatalog = resolve; }));
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(catalogRead).toHaveBeenCalledTimes(2);
    expect(paymentRead).toHaveBeenCalledTimes(2);
    await act(async () => resolveCatalog(createCatalogData()));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/processing'));
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(JSON.parse(screen.getByTestId('request-state').textContent!)).toEqual({
      items: [createCartItem({ quantity: 2 })], payment: createPaymentSettings(), requestId,
    });
  });

  it('keeps the customer in the shop if they go back while validation is pending', async () => {
    renderCheckout();
    const button = await ready();
    let resolveCatalog!: (catalog: CatalogData) => void;
    catalogRead.mockImplementationOnce(() => new Promise((resolve) => { resolveCatalog = resolve; }));
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('button', { name: '← 장바구니' }));
    await act(async () => resolveCatalog(createCatalogData()));
    expect(screen.getByTestId('location')).toHaveTextContent('/shop');
    expect(crypto.randomUUID).not.toHaveBeenCalled();
    expect(useCartStore.getState().itemCount()).toBe(2);
  });

  it.each(['catalog', 'payment'])('shows a recoverable %s submission read error', async (source) => {
    renderCheckout();
    const button = await ready();
    (source === 'catalog' ? catalogRead : paymentRead).mockRejectedValueOnce(new Error('읽기 실패'));
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent(/다시 시도/);
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/processing'));
  });

  it('shows loading and lets the customer recover from initial loading errors', async () => {
    catalogRead.mockRejectedValueOnce(new Error('읽기 실패'));
    renderCheckout();
    expect(screen.getByRole('status')).toHaveTextContent(/불러/);
    expect(await screen.findByRole('alert')).toHaveTextContent(/불러/);
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(await ready()).toBeEnabled();
    expect(catalogRead).toHaveBeenCalledTimes(2);
    expect(paymentRead).toHaveBeenCalledTimes(2);
  });

  it('renders missing products safely and blocks them on submission', async () => {
    catalogRead.mockResolvedValue(createCatalogData({ products: [] }));
    renderCheckout();
    fireEvent.click(await ready());
    expect(await screen.findByRole('alert')).toHaveTextContent('horizon-album');
    expect(screen.getByTestId('location')).toHaveTextContent('/checkout');
  });
});
