# Checkout & Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the checkout review and simulated payment flow with current-catalog revalidation, mode-specific copy, duplicate protection, and terminal order creation.

**Architecture:** Keep price and availability comparison in one pure domain function. The checkout page owns display and confirmation state; the processing page owns the short timer and the single `orders.create` call. Existing Electron order IPC remains the final trust boundary and idempotency layer.

**Tech Stack:** React 19, React Router 7, Zustand 5, TypeScript, Vitest, Testing Library, existing Electron IPC and CSS tokens.

---

### Task 1: Current-catalog checkout review

**Files:**
- Create: `src/domain/order/reviewCart.ts`
- Test: `src/domain/order/reviewCart.test.ts`

- [ ] **Step 1: Write the failing domain tests**

```ts
import { describe, expect, it } from 'vitest';
import { createCartItem, createCatalogData, createProduct } from '../../test/fixtures';
import { reviewCart } from './reviewCart';

describe('reviewCart', () => {
  it('uses current prices and reports changed lines', () => {
    const review = reviewCart([createCartItem()], createCatalogData({
      products: [createProduct({ price: 27000 })],
    }));
    expect(review.total).toBe(27000);
    expect(review.priceChanges).toEqual([{ productId: 'horizon-album', name: 'HORIZON Album', before: 25000, after: 27000 }]);
    expect(review.blockers).toEqual([]);
  });

  it.each([
    ['hidden', createProduct({ isVisible: false })],
    ['sold out', createProduct({ saleStatus: 'soldOut' })],
  ])('blocks %s products', (_label, product) => {
    const review = reviewCart([createCartItem()], createCatalogData({ products: [product] }));
    expect(review.blockers).toHaveLength(1);
  });

  it('blocks quantities over the current maximum', () => {
    const review = reviewCart(
      [createCartItem({ quantity: 6 })],
      createCatalogData({ products: [createProduct({ maxQuantity: 5 })] }),
    );
    expect(review.blockers).toEqual(['HORIZON Album은(는) 최대 5개까지 구매할 수 있습니다.']);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/domain/order/reviewCart.test.ts`

Expected: FAIL because `./reviewCart` does not exist.

- [ ] **Step 3: Implement the pure comparison**

```ts
import type { CartItem, CatalogData, Product } from '../contracts';

export interface ReviewedLine { item: CartItem; product: Product; lineTotal: number }
export interface PriceChange { productId: string; name: string; before: number; after: number }

export function reviewCart(items: CartItem[], catalog: CatalogData) {
  const products = new Map(catalog.products.map((product) => [product.id, product]));
  const lines: ReviewedLine[] = [];
  const blockers: string[] = [];
  const priceChanges: PriceChange[] = [];

  for (const item of items) {
    const product = products.get(item.productId);
    if (!product || !product.isVisible || product.saleStatus !== 'onSale') {
      blockers.push(`${product?.name ?? item.productId}은(는) 현재 판매할 수 없습니다.`);
      continue;
    }
    if (item.quantity > product.maxQuantity) {
      blockers.push(`${product.name}은(는) 최대 ${product.maxQuantity}개까지 구매할 수 있습니다.`);
    }
    if (item.capturedUnitPrice !== product.price) {
      priceChanges.push({ productId: item.productId, name: product.name, before: item.capturedUnitPrice, after: product.price });
    }
    lines.push({ item, product, lineTotal: item.quantity * product.price });
  }

  return {
    lines,
    blockers,
    priceChanges,
    total: lines.reduce((sum, line) => sum + line.lineTotal, 0),
    priceKey: priceChanges.map(({ productId, after }) => `${productId}:${after}`).join('|'),
  };
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/domain/order/reviewCart.test.ts`

Expected: one test file passing with no warnings.

- [ ] **Step 5: Commit**

```text
git add src/domain/order
git commit -m "feat: review cart against current catalog"
```

### Task 2: Checkout review screen and payment modes

**Files:**
- Create: `src/features/checkout/CheckoutPage.tsx`
- Create: `src/features/checkout/checkout.css`
- Create: `src/features/checkout/CheckoutPage.test.tsx`

- [ ] **Step 1: Write failing screen tests**

Create tests that seed `useCartStore`, stub `catalog.read` and `settings.readPayment`, then assert:

```tsx
expect(await screen.findByRole('heading', { name: '주문 내용을 확인해 주세요' })).toBeInTheDocument();
expect(screen.getByTestId('checkout-items')).toHaveClass('checkout-items');
expect(screen.getByTestId('checkout-fixed')).toHaveClass('checkout-fixed');
expect(screen.getByRole('button', { name: '결제하기' })).toBeEnabled();
```

Use `it.each` for exact mode buttons:

```ts
it.each([
  ['instant', '결제하기'],
  ['bankQr', '입금했어요'],
  ['simulation', '결제 시뮬레이션'],
] as const)('shows the %s action', async (mode, label) => {
  payment = createPaymentSettings(mode === 'bankQr' ? {
    mode, bankName: '하늘은행', accountNumber: '123-456', accountHolder: 'HIGHEST', qrImage: 'images/qr.png',
  } : { mode });
  renderCheckout();
  expect(await screen.findByRole('button', { name: label })).toBeInTheDocument();
});
```

Add assertions that an empty cart disables the action, bank QR renders account details and never contains `결제 완료`, unavailable/max-quantity changes render alerts, a changed price requires two clicks, and two immediate clicks produce one navigation to `/processing`.

```ts
expect(screen.getByRole('button', { name: '결제하기' })).toBeDisabled();
expect(screen.queryByText(/결제 완료/u)).not.toBeInTheDocument();
expect(await screen.findByRole('alert')).toHaveTextContent('현재 판매할 수 없습니다');
expect(await screen.findByText('25,000원 → 27,000원')).toBeInTheDocument();
fireEvent.click(screen.getByRole('button', { name: '변경 금액 확인하고 계속' }));
expect(screen.getByTestId('location')).toHaveTextContent('/processing');
```

Click both `← 장바구니` and `주문 수정하기` in separate cases and assert `/shop` plus the unchanged Zustand item count.

- [ ] **Step 2: Run the screen test and verify RED**

Run: `npm test -- src/features/checkout/CheckoutPage.test.tsx`

Expected: FAIL because `CheckoutPage` does not exist.

- [ ] **Step 3: Implement the checkout screen**

The page loads catalog and payment settings together, renders only the order list as scrollable, and keeps totals/actions in a sibling fixed section:

```tsx
const actionLabel = {
  instant: '결제하기',
  bankQr: '입금했어요',
  simulation: '결제 시뮬레이션',
} as const;

function BankQr({ settings }: { settings: PaymentSettings }) {
  return <section aria-label="계좌·QR 안내"><h2>주문 접수 안내</h2><p>{settings.bankName} {settings.accountNumber}</p><p>예금주 {settings.accountHolder}</p><img alt="입금 QR" src={toKioskMediaUrl(settings.qrImage)} /><p>입금 여부는 운영자가 확인합니다.</p></section>;
}

<main className="checkout-page">
  <header className="checkout-header">
    <button onClick={() => navigate('/shop')} type="button">← 장바구니</button>
    <div><strong>HIGHEST</strong><span>CLOUD ACADEMY CHECKOUT</span></div>
  </header>
  <h1>주문 내용을 확인해 주세요</h1>
  <section aria-label="주문 상품" className="checkout-items" data-testid="checkout-items">
    {review.lines.map(({ item, product, lineTotal }) => (
      <article className="checkout-line" key={product.id}>
        <img alt="" src={toKioskMediaUrl(product.thumbnailImage)} />
        <strong>{product.name}</strong><span>수량 {item.quantity}</span><b>{won(lineTotal)}</b>
      </article>
    ))}
  </section>
  <section className="checkout-fixed" data-testid="checkout-fixed">
    <dl><div><dt>상품 금액</dt><dd>{won(review.total)}</dd></div><div><dt>할인</dt><dd>0원</dd></div><div><dt>최종 금액</dt><dd>{won(review.total)}</dd></div></dl>
    {payment.mode === 'bankQr' && <BankQr settings={payment} />}
    <button onClick={() => navigate('/shop')} type="button">주문 수정하기</button>
    <button disabled={items.length === 0 || locked} onClick={() => void submit()} type="button">{actionLabel[payment.mode]}</button>
  </section>
</main>
```

`submit()` immediately sets a ref lock, rereads catalog/payment, calls `reviewCart`, blocks on `blockers`, and stores `priceKey` after the first price-change click. Only an identical reviewed `priceKey` on the second click navigates with `{ items, payment, requestId: crypto.randomUUID() }`. Release the lock in every non-navigation path.

Use CSS grid rows `auto auto minmax(0, 1fr) auto`; set only `.checkout-items { overflow-y: auto; scrollbar-width: thin; }`. Keep all touch targets at the global 48px minimum and use existing color/radius tokens.

- [ ] **Step 4: Run the screen tests and verify GREEN**

Run: `npm test -- src/features/checkout/CheckoutPage.test.tsx`

Expected: all checkout page tests passing.

- [ ] **Step 5: Commit**

```text
git add src/features/checkout
git commit -m "feat: add checkout review screen"
```

### Task 3: Processing, terminal order creation, and retry

**Files:**
- Create: `src/features/checkout/ProcessingPage.tsx`
- Create: `src/features/checkout/ProcessingPage.test.tsx`
- Modify: `src/features/checkout/checkout.css`

- [ ] **Step 1: Write failing processing tests**

Export this router-state contract from the page test target:

```ts
export interface ProcessingState {
  items: CartItem[];
  payment: PaymentSettings;
  requestId: string;
}
```

With fake timers, verify that `orders.create` has not run before `processingSeconds`, runs once after the timer, and routes paid/received orders to `/complete/:orderNumber`. For a failed order assert `결제 시뮬레이션에 실패했습니다`, `다시 시도`, and `장바구니로` are shown. Click retry and assert the second `orders.create` input has a different `requestId`. Render `/processing` without router state and assert redirect to `/checkout`:

```ts
expect(window.kiosk.orders.create).not.toHaveBeenCalled();
await vi.advanceTimersByTimeAsync(3000);
expect(window.kiosk.orders.create).toHaveBeenCalledTimes(1);
expect(screen.getByTestId('location')).toHaveTextContent('/complete/20260926-0001');

fireEvent.click(await screen.findByRole('button', { name: '다시 시도' }));
await vi.advanceTimersByTimeAsync(3000);
const calls = vi.mocked(window.kiosk.orders.create).mock.calls;
expect(calls[1][0].requestId).not.toBe(calls[0][0].requestId);
```

- [ ] **Step 2: Run the processing test and verify RED**

Run: `npm test -- src/features/checkout/ProcessingPage.test.tsx`

Expected: FAIL because `ProcessingPage` does not exist.

- [ ] **Step 3: Implement processing with one effect-owned request**

```tsx
export function ProcessingPage() {
  const navigate = useNavigate();
  const { state } = useLocation() as { state: ProcessingState | null };
  const [failure, setFailure] = useState(false);

  useEffect(() => {
    if (!state) { navigate('/checkout', { replace: true }); return; }
    const timer = window.setTimeout(() => {
      void window.kiosk.orders.create({ requestId: state.requestId, items: state.items })
        .then((order) => order.status === 'failed'
          ? setFailure(true)
          : navigate(`/complete/${order.orderNumber}`, { replace: true }))
        .catch(() => setFailure(true));
    }, state.payment.processingSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [navigate, state]);

  if (!state) return null;
  if (failure) return <main className="processing-page"><h1>결제 시뮬레이션에 실패했습니다</h1><button onClick={() => { setFailure(false); navigate('/processing', { replace: true, state: { ...state, requestId: crypto.randomUUID() } }); }} type="button">다시 시도</button><button onClick={() => navigate('/shop')} type="button">장바구니로</button></main>;
  return <main className="processing-page"><div aria-hidden="true" className="processing-star">✦</div><h1>{state.payment.mode === 'bankQr' ? '주문을 접수하고 있어요' : '결제를 처리하고 있어요'}</h1></main>;
}
```

The retry must replace the route with a fresh state object so the effect starts a new request. The existing main-process IPC creates terminal orders only after this presentation delay and deduplicates StrictMode or double invocations by `requestId`.

- [ ] **Step 4: Run processing and IPC tests**

Run: `npm test -- src/features/checkout/ProcessingPage.test.tsx electron/ipc/orderIpc.test.ts`

Expected: both files passing, including duplicate request and failed retry cases.

- [ ] **Step 5: Commit**

```text
git add src/features/checkout
git commit -m "feat: process simulated payments once"
```

### Task 4: Route integration and existing test harness repair

**Files:**
- Modify: `src/app/router.tsx`
- Modify: `src/app/router.test.tsx`
- Modify: `src/renderer/App.test.tsx`

- [ ] **Step 1: Change route expectations first**

Replace placeholder expectations with `주문 내용을 확인해 주세요` for `/checkout` and a state-aware route test for `/processing`. Give router and renderer tests a complete minimal kiosk stub containing `catalog.read`, `settings.read`, and `settings.readPayment`; this also repairs the three failures already present on `origin/main`.

- [ ] **Step 2: Run router/renderer tests and verify RED for real routes**

Run: `npm test -- src/app/router.test.tsx src/renderer/App.test.tsx`

Expected: checkout/processing assertions fail while the pre-existing Welcome stub failures disappear.

- [ ] **Step 3: Replace only the two placeholders**

```tsx
import { CheckoutPage } from '../features/checkout/CheckoutPage';
import { ProcessingPage } from '../features/checkout/ProcessingPage';

{ path: '/checkout', element: <CheckoutPage /> },
{ path: '/processing', element: <ProcessingPage /> },
```

Do not change product-detail, completion, admin, or fallback routes.

- [ ] **Step 4: Run route, checkout, and processing tests**

Run: `npm test -- src/app/router.test.tsx src/renderer/App.test.tsx src/features/checkout/CheckoutPage.test.tsx src/features/checkout/ProcessingPage.test.tsx`

Expected: all selected tests passing.

- [ ] **Step 5: Commit common route changes separately**

```text
git add src/app/router.tsx src/app/router.test.tsx src/renderer/App.test.tsx
git commit -m "feat: route checkout payment flow"
```

### Task 5: Full verification and mode screenshots

**Files:**
- Create: `docs/development/screenshots/checkout-instant.png`
- Create: `docs/development/screenshots/checkout-bank-qr.png`
- Create: `docs/development/screenshots/checkout-simulation.png`

- [ ] **Step 1: Verify all required commands freshly**

Run in order:

```text
npm run lint
npm run typecheck
npm test
```

Expected: each exits 0; tests report zero failures. Do not claim completion if any command fails.

- [ ] **Step 2: Capture each configured mode at 1080×1920**

Start the Electron renderer with the existing preload-backed app data, set each payment mode through the admin settings, place at least two goods in the cart, and save the checkout screen to the three exact paths above. Verify the bank QR image contains `주문 접수` or operator-confirmation language and contains no `결제 완료` text.

- [ ] **Step 3: Review the final diff and contracts**

Run:

```text
git diff origin/main...HEAD --check
git diff origin/main...HEAD --stat
git status --short
```

Confirm the completed contract remains: `orders.create({ requestId, items })` returns one persisted terminal `Order`; `orders.read(orderNumber)` returns that order or `null`; statuses are instant=`paid`, bankQr=`received`, simulation success=`paid`, simulation failure=`failed`.

- [ ] **Step 4: Commit screenshots**

```text
git add docs/development/screenshots
git commit -m "docs: capture checkout payment modes"
```
