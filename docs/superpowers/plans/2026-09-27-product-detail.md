# Product Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tested `/products/:productId` customer detail page that reuses the catalog contract and cart store.

**Architecture:** Keep one feature page with local helpers for product resolution, image fallback, and quantity display. Register it in the existing router; use the existing `window.kiosk.catalog.read`, `toKioskMediaUrl`, and `useCartStore`. Preserve shop return state with browser history state and a small catalog-page change only if the existing contract lacks the data.

**Tech Stack:** React, React Router, Zustand, Vitest, Testing Library, CSS modules/plain feature CSS.

---

### Task 1: Add failing product-detail behavior tests

**Files:**
- Create: `src/features/product-detail/ProductDetailPage.test.tsx`
- Modify: `src/app/router.test.tsx`

- [ ] **Step 1: Write tests** for loading a normal product, showing detail images/name/price/description/specifications, quantity max clamping, add feedback without navigation, sold-out disabled actions, missing/hidden messages, cart merging on buy-now, and image fallback.
- [ ] **Step 2: Run the focused tests**

Run: `npm test -- src/features/product-detail/ProductDetailPage.test.tsx src/app/router.test.tsx`
Expected: FAIL because the page and route are not implemented.

### Task 2: Implement the minimum product detail page

**Files:**
- Create: `src/features/product-detail/ProductDetailPage.tsx`
- Create: `src/features/product-detail/product-detail.css`
- Modify: `src/app/router.tsx`

- [ ] **Step 1: Implement catalog loading and product resolution** using active categories, `isVisible`, and `productId`.
- [ ] **Step 2: Implement square gallery, dots, fallback image, quantity controls, total, and explicit missing/hidden/sold-out states.**
- [ ] **Step 3: Wire `cart.add(product, quantity)` and `navigate('/checkout')` for buy-now; keep add-to-cart on the page with a short success message.**
- [ ] **Step 4: Register `ProductDetailPage` at `/products/:productId`.**
- [ ] **Step 5: Run focused tests and fix only production failures.**

Run: `npm test -- src/features/product-detail/ProductDetailPage.test.tsx src/app/router.test.tsx`
Expected: PASS.

### Task 3: Preserve catalog return state

**Files:**
- Modify: `src/features/catalog/CatalogPage.tsx`
- Modify: `src/features/catalog/CatalogPage.test.tsx`
- Modify: `src/features/product-detail/ProductDetailPage.test.tsx`

- [ ] **Step 1: Add a failing test** that navigates from a selected catalog category with a scroll position and verifies returning from detail restores both.
- [ ] **Step 2: Pass the state through the product link navigation and restore it when CatalogPage mounts.**
- [ ] **Step 3: Run the catalog and detail tests.**

Run: `npm test -- src/features/catalog/CatalogPage.test.tsx src/features/product-detail/ProductDetailPage.test.tsx`
Expected: PASS.

### Task 4: Verify the whole change

**Files:**
- No new files.

- [ ] **Step 1: Run `npm run lint`.**
- [ ] **Step 2: Run `npm run typecheck`.**
- [ ] **Step 3: Run `npm test`.**
- [ ] **Step 4: Run the existing e2e command if the project exposes one and capture a 9:16 screenshot.**
- [ ] **Step 5: Review the diff and report the blocked git operations caused by the read-only `.git` directory.**
