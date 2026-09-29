# 웰컴 화면 관리자 진입 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로고 숨김 상태에서도 웰컴 화면에서 관리자 로그인으로 진입하고, 빈 안내 문구를 저장할 수 있게 한다.

**Architecture:** `WelcomePage`의 기존 길게 누르기 타이머를 우측 하단의 투명 버튼에도 연결한다. 공유 설정 계약의 안내 문구를 빈 문자열 허용으로 완화하고, 관리자 저장 전 검증도 같은 계약을 사용한다.

**Tech Stack:** React, React Router, Zod, Vitest, Testing Library

---

### Task 1: 웰컴 화면 진입과 빈 문구 계약

**Files:**
- Modify: `src/features/welcome/WelcomePage.tsx`
- Modify: `src/features/welcome/WelcomePage.test.tsx`
- Modify: `src/domain/contracts.ts`
- Modify: `src/domain/contracts.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
it('opens admin login after holding the hidden corner control when the logo is hidden', () => {
  // render with welcomeLogoVisible: false, hold the labelled corner control, then expect /admin/login
});

it('accepts an empty welcome message', () => {
  expect(appSettingsSchema.parse({ ...validAppSettings, welcomeMessage: '' })).toBeTruthy();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm.cmd test -- src/features/welcome/WelcomePage.test.tsx src/domain/contracts.test.ts`

Expected: FAIL because no hidden control exists and the message schema rejects an empty string.

- [ ] **Step 3: Implement the minimal change**

```tsx
<button aria-label="관리자 진입" className={styles.adminHotspot} type="button"
  onPointerDown={startAdminHold} onPointerUp={cancelAdminHold}
  onPointerLeave={cancelAdminHold} onPointerCancel={cancelAdminHold} />
```

```ts
const welcomeMessage = z.string();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm.cmd test -- src/features/welcome/WelcomePage.test.tsx src/domain/contracts.test.ts src/features/admin/SettingsAdmin.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/welcome/WelcomePage.tsx src/features/welcome/WelcomePage.test.tsx src/domain/contracts.ts src/domain/contracts.test.ts src/features/admin/SettingsAdmin.tsx src/features/admin/SettingsAdmin.test.tsx
git commit -m "feat: keep admin entry available on welcome screen"
```
