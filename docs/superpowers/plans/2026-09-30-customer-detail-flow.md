# Customer Detail Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fit product detail and payment processing into the kiosk frame while returning shoppers to the catalog after adding a product.

**Architecture:** Reuse the current route state and cart store. The detail page changes only its post-add navigation and layout classes; the processing page retains its existing order side effects and receives CSS-only presentation changes.

**Tech Stack:** React, React Router, Zustand, Vitest, CSS.

---

### Task 1: Return from product detail after adding

**Files:**
- Modify: `src/features/product-detail/ProductDetailPage.tsx`
- Modify: `src/features/product-detail/ProductDetailPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
fireEvent.click(screen.getByRole('button', { name: '장바구니 담기' }));
expect(screen.getByTestId('location')).toHaveTextContent('/shop');
expect(useCartStore.getState().items['detail-product']?.quantity).toBe(2);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm.cmd test -- src/features/product-detail/ProductDetailPage.test.tsx`

- [ ] **Step 3: Navigate after the existing cart add**

```tsx
cart.add(product, quantity);
navigate('/shop', { state: location.state });
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm.cmd test -- src/features/product-detail/ProductDetailPage.test.tsx`

### Task 2: Compact customer presentation

**Files:**
- Modify: `src/features/product-detail/product-detail.css`
- Modify: `src/features/checkout/checkout.css`
- Test: `src/features/checkout/ProcessingPage.test.tsx`

- [ ] **Step 1: Replace oversized portrait detail rules with fixed grid rows**

Keep the primary image, one-line title, two-line description, compact specifications and action dock within `100dvh`; use white backgrounds and hidden scrollbar chrome.

- [ ] **Step 2: Replace processing viewport typography with fixed sizes**

Keep `.processing-page` white and use a centered compact heading/status/loading mark without changing timer or failure interactions.

- [ ] **Step 3: Verify behavior and build**

Run: `npm.cmd test -- src/features/product-detail/ProductDetailPage.test.tsx src/features/checkout/ProcessingPage.test.tsx && npm.cmd run typecheck && npm.cmd run build:web`
