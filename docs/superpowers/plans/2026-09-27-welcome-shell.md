# Welcome & Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the configurable, resilient customer welcome route for the HIGHEST kiosk.

**Architecture:** A `WelcomePage` reads the existing settings API locally and renders safe defaults on failure. A small local long-press hook owns only timer cleanup; the existing router and cart store remain unchanged.

**Tech Stack:** React, React Router, TypeScript, CSS Modules, Vitest, React Testing Library, Playwright.

---

### Task 1: Welcome route tests

**Files:**
- Create: `src/features/welcome/WelcomePage.test.tsx`
- Modify: `src/app/router.tsx`

- [ ] **Step 1: Write failing route tests**

```tsx
it('uses persisted background image, focal position, scale, logo visibility, and message', async () => {
  window.kiosk.settings.read = vi.fn().mockResolvedValue(createAppSettings({
    welcomeBackgroundImage: 'images/custom.png',
    welcomeImagePosition: { x: 30, y: 70 },
    welcomeImageScale: 1.2,
    welcomeLogoVisible: false,
    welcomeMessage: '오늘도 같이 날아!'
  }));
  renderWelcome();
  expect(await screen.findByText('오늘도 같이 날아!')).toBeVisible();
  expect(screen.queryByText('HIGHEST')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Verify the test fails**

Run: `npm test -- src/features/welcome/WelcomePage.test.tsx`

Expected: FAIL because the welcome route and page do not exist.

- [ ] **Step 3: Add the page to the existing `/` route**

```tsx
{ path: '/', element: <WelcomePage /> }
```

- [ ] **Step 4: Verify the focused test passes**

Run: `npm test -- src/features/welcome/WelcomePage.test.tsx`

Expected: PASS.

### Task 2: Safe settings and navigation behaviour

**Files:**
- Create: `src/features/welcome/WelcomePage.tsx`
- Create: `src/features/welcome/WelcomePage.module.css`
- Modify: `src/features/welcome/WelcomePage.test.tsx`

- [ ] **Step 1: Write failing fallback and start-action tests**

```tsx
it('keeps the default background and message when settings read fails', async () => {
  window.kiosk.settings.read = vi.fn().mockRejectedValue(new Error('offline'));
  renderWelcome();
  expect(await screen.findByText('새로운 수평선을 만나보세요.')).toBeVisible();
});

it('navigates to shop without clearing the cart', async () => {
  useCartStore.getState().add(product);
  const router = renderWelcome();
  await userEvent.click(screen.getByRole('button', { name: '굿즈 사러가기' }));
  expect(router.state.location.pathname).toBe('/shop');
  expect(useCartStore.getState().itemCount()).toBe(1);
});
```

- [ ] **Step 2: Verify the tests fail**

Run: `npm test -- src/features/welcome/WelcomePage.test.tsx`

Expected: FAIL because settings fallback and start navigation are absent.

- [ ] **Step 3: Implement the smallest local settings state**

```tsx
const [settings, setSettings] = useState(defaultWelcomeSettings);
useEffect(() => { void window.kiosk.settings.read().then(setSettings).catch(() => undefined); }, []);
const navigate = useNavigate();
```

- [ ] **Step 4: Verify the tests pass**

Run: `npm test -- src/features/welcome/WelcomePage.test.tsx`

Expected: PASS.

### Task 3: Long press and resilient portrait layout

**Files:**
- Modify: `src/features/welcome/WelcomePage.tsx`
- Modify: `src/features/welcome/WelcomePage.module.css`
- Modify: `src/features/welcome/WelcomePage.test.tsx`

- [ ] **Step 1: Write failing long-press and viewport tests**

```tsx
it('opens admin only after the configured long press', async () => {
  vi.useFakeTimers();
  const router = renderWelcome();
  fireEvent.pointerDown(screen.getByRole('button', { name: 'HIGHEST 관리자 진입' }));
  await vi.advanceTimersByTimeAsync(800);
  expect(router.state.location.pathname).toBe('/admin/login');
});

it('does not open admin after a short press', () => {
  fireEvent.pointerDown(screen.getByRole('button', { name: 'HIGHEST 관리자 진입' }));
  fireEvent.pointerUp(screen.getByRole('button', { name: 'HIGHEST 관리자 진입' }));
  expect(router.state.location.pathname).toBe('/');
});
```

- [ ] **Step 2: Verify the tests fail**

Run: `npm test -- src/features/welcome/WelcomePage.test.tsx`

Expected: FAIL because the hidden entry is absent.

- [ ] **Step 3: Add one timeout-based pointer hold and responsive CSS**

```tsx
const hold = useRef<number>();
const startHold = () => { hold.current = window.setTimeout(() => navigate('/admin/login'), 800); };
const cancelHold = () => window.clearTimeout(hold.current);
```

- [ ] **Step 4: Verify focused tests pass**

Run: `npm test -- src/features/welcome/WelcomePage.test.tsx`

Expected: PASS.

### Task 4: Full verification and handoff

**Files:**
- Modify: `e2e/renderer.spec.ts` only if a welcome smoke test can reuse its current Electron fixture.

- [ ] **Step 1: Run static checks**

Run: `npm run lint && npm run typecheck`

Expected: PASS.

- [ ] **Step 2: Run all unit tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 3: Run the focused Playwright smoke test if available**

Run: `npm run test:e2e -- --grep "welcome"`

Expected: PASS or report that the existing Electron harness cannot isolate this screen.

- [ ] **Step 4: Capture a 9:16 screenshot and compare it with `docs/design-references/01-welcome-goods.png`**

Expected: the CTA remains visible, the background has no empty edge, and the visual hierarchy matches the reference.

- [ ] **Step 5: Commit the implementation**

```bash
git add src/features/welcome src/app/router.tsx e2e/renderer.spec.ts
git commit -m "feat: add welcome shell"
```
