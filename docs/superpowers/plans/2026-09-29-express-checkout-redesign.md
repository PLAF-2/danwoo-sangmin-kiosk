# Express Checkout Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the selected Express Checkout visual direction to the customer kiosk while preserving catalog, cart, payment, and administration behavior.

**Architecture:** Reuse current React routes and the Zustand cart store. Simplify only decorative customer markup, then restyle existing screen CSS around cream, navy, and blue tokens. Keep admin pages in their existing desktop-oriented layout.

**Tech Stack:** React 19, React Router, Zustand, CSS, Vitest, Testing Library.

---

### Task 1: Simplify customer catalog chrome

**Files:**
- Modify: `src/features/catalog/CatalogPage.tsx`
- Modify: `src/features/catalog/catalog.css`
- Test: `src/features/catalog/CatalogPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('keeps only functional catalog controls in the express layout', async () => {
  renderCatalog();
  await screen.findByText('앨범 상품');
  expect(screen.queryByRole('button', { name: /검색|메뉴/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '구매하러 가기' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the catalog test and verify it fails before the express landmark exists.**

Run: `npm.cmd test -- src/features/catalog/CatalogPage.test.tsx`

- [ ] **Step 3: Replace the catalog header with only the functional home button and HIGHEST label, retain category/product/cart controls, and use CSS for a larger navy cart dock.**

- [ ] **Step 4: Re-run the catalog test and verify it passes.**

- [ ] **Step 5: Commit `src/features/catalog/CatalogPage.tsx`, `src/features/catalog/catalog.css`, and `src/features/catalog/CatalogPage.test.tsx` as `feat: redesign express catalog`.**

### Task 2: Remove decorative customer chrome and unify route styling

**Files:**
- Modify: `src/features/welcome/WelcomePage.module.css`
- Modify: `src/features/product-detail/ProductDetailPage.tsx`
- Modify: `src/features/product-detail/product-detail.css`
- Modify: `src/features/checkout/checkout.css`
- Modify: `src/features/completion/CompletionPage.tsx`
- Modify: `src/features/completion/completion.css`
- Test: `src/features/product-detail/ProductDetailPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('does not render decorative cloud chrome in the product header', async () => {
  renderPage();
  await screen.findByRole('heading', { name: '상세 상품' });
  expect(document.body.textContent).not.toContain('☁');
});
```

- [ ] **Step 2: Run the detail test and verify it fails because the cloud is present.**

Run: `npm.cmd test -- src/features/product-detail/ProductDetailPage.test.tsx`

- [ ] **Step 3: Remove only the cloud marker; restyle welcome, detail, checkout, processing and completion with clear blue primary actions and white rounded surfaces while retaining every existing functional control.**

- [ ] **Step 4: Run focused route tests and verify they pass.**

Run: `npm.cmd test -- src/features/product-detail/ProductDetailPage.test.tsx src/features/checkout/CheckoutPage.test.tsx src/features/welcome/WelcomePage.test.tsx src/features/completion/CompletionPage.test.tsx`

- [ ] **Step 5: Commit these customer route files as `feat: unify customer kiosk design`.**

### Task 3: Verify the redesign

**Files:**
- Create: `design-qa.md`

- [ ] **Step 1: Run focused catalog, detail, checkout, welcome and completion tests.**

- [ ] **Step 2: Run `npm.cmd run typecheck` and `npm.cmd run build:web`.**

- [ ] **Step 3: Capture `/shop` at portrait dimensions, compare it with the third generated visual, and write `design-qa.md` with source/capture paths, viewport, fidelity surfaces, interaction checks and `final result: passed` only after P0/P1/P2 issues are fixed.**

- [ ] **Step 4: Commit `design-qa.md` as `docs: verify express kiosk redesign`.**
