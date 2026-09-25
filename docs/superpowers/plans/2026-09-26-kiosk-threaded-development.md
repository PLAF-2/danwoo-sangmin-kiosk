# HIGHEST Kiosk Threaded Development Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Electron + React + TypeScript 기반 HIGHEST 굿즈 키오스크를 화면과 기능 경계별 Git 스레드로 나누어 안전하게 개발한다.

**Architecture:** Electron main process가 키오스크 창과 로컬 파일 저장을 담당하고, sandboxed preload가 최소 권한의 typed IPC API만 renderer에 공개한다. React renderer는 공통 도메인 타입과 저장 API를 사용하며 웰컴, 상품, 상세, 결제, 완료, 관리자 기능을 기능 폴더 단위로 분리한다.

**Tech Stack:** Electron Forge Vite TypeScript template, React, React Router, Zustand, Zod, CSS Modules, Vitest, React Testing Library, Playwright, npm

---

## 기준 자료

- 원격 저장소: `https://github.com/PLAF-2/danwoo-sangmin-kiosk.git`
- 기능 명세: `docs/superpowers/specs/2026-09-26-highest-kiosk-functional-design.md`
- 콘셉트 문서: `HIGHEST_HORIZON_CONCEPT.md`
- 화면 참조: `docs/design-references/01-welcome-goods.png`부터 `05-payment-complete.png`
- 스레드 실행 안내: `docs/development/THREAD_EXECUTION_GUIDE.md`
- 복사용 프롬프트: `docs/development/prompts/*.md`

2026-09-26 확인 시 원격 저장소에는 참조할 수 있는 브랜치나 커밋이 없었다. 따라서 Foundation 스레드가 최초 실행 가능한 기준선을 만들고 `main`에 병합한 뒤 나머지 스레드를 시작한다.

## 고정 경로와 화면 계약

```text
/                         웰컴
/shop                     상품 목록·장바구니
/products/:productId      상품 상세
/checkout                 주문 확인·결제 선택
/processing               결제 시뮬레이션 처리
/complete/:orderNumber    완료·접수
/admin/login              관리자 로그인
/admin/products           상품 관리
/admin/categories         카테고리 관리
/admin/welcome            웰컴 관리
/admin/payment            결제 설정
/admin/system             백업·비밀번호·시스템 설정
```

## 목표 파일 구조

```text
electron/
  main.ts
  preload.ts
  ipc/
    catalogIpc.ts
    settingsIpc.ts
    mediaIpc.ts
    orderIpc.ts
    adminIpc.ts
    backupIpc.ts
  storage/
    atomicJsonStore.ts
    paths.ts
src/
  app/
    App.tsx
    router.tsx
    providers.tsx
  domain/
    catalog/
    cart/
    order/
    settings/
    session/
  components/
    layout/
    feedback/
    controls/
  features/
    welcome/
    catalog/
    product-detail/
    checkout/
    completion/
    admin/
  services/
    kioskApi.ts
  styles/
    tokens.css
    global.css
  test/
    setup.ts
    fixtures.ts
data/defaults/
  catalog.json
  settings.json
  payment.json
e2e/
  customer-flow.spec.ts
  admin-editing.spec.ts
```

## 공통 인터페이스

Foundation 스레드는 아래 타입과 API 이름을 먼저 고정한다. 후속 스레드는 같은 의미의 타입을 새로 만들지 않는다.

```ts
type PaymentMode = 'instant' | 'bankQr' | 'simulation';
type SaleStatus = 'onSale' | 'soldOut';

interface Category {
  id: string;
  name: string;
  isActive: boolean;
  displayOrder: number;
}

interface Product {
  id: string;
  name: string;
  price: number;
  categoryId: string;
  thumbnailImage: string;
  detailImages: string[];
  description: string;
  specifications: Array<{ label: string; value: string }>;
  saleStatus: SaleStatus;
  isVisible: boolean;
  displayOrder: number;
  maxQuantity: number;
  createdAt: string;
  updatedAt: string;
}

interface CartItem {
  productId: string;
  quantity: number;
  capturedUnitPrice: number;
}

interface Order {
  orderNumber: string;
  items: Array<CartItem & { name: string; thumbnailImage: string }>;
  subtotal: number;
  discount: number;
  total: number;
  paymentMode: PaymentMode;
  status: 'processing' | 'paid' | 'received' | 'failed';
  createdAt: string;
}
```

Renderer가 사용할 preload 계약은 `window.kiosk` 하나로 제한한다.

```ts
interface KioskApi {
  catalog: {
    read(): Promise<{ categories: Category[]; products: Product[] }>;
    save(input: { categories: Category[]; products: Product[] }): Promise<void>;
  };
  settings: {
    read(): Promise<AppSettings>;
    save(input: AppSettings): Promise<void>;
    readPayment(): Promise<PaymentSettings>;
    savePayment(input: PaymentSettings): Promise<void>;
  };
  media: {
    importSquareImage(): Promise<string | null>;
    importWelcomeImage(): Promise<string | null>;
  };
  orders: {
    create(input: CreateOrderInput): Promise<Order>;
    read(orderNumber: string): Promise<Order | null>;
  };
  admin: {
    authenticate(password: string): Promise<boolean>;
    changePassword(currentPassword: string, nextPassword: string): Promise<void>;
    exportBackup(): Promise<string | null>;
    importBackup(): Promise<void>;
  };
}
```

## 스레드 의존성

```text
00 Foundation
 ├─ 01 Welcome & Shell
 ├─ 02 Catalog & Cart ─┬─ 03 Product Detail
 │                     └─ 04 Checkout & Payment ── 05 Completion & Session
 └─ 06 Admin

01 + 03 + 05 + 06 ── 07 Integration & QA
```

Foundation이 `main`에 병합되기 전에는 다른 스레드를 시작하지 않는다. Foundation 이후 `01`, `02`, `06`은 병렬 진행할 수 있다. `03`은 `02`, `04`는 `02`, `05`는 `04`가 병합된 뒤 시작한다.

## Task 1: Foundation 기준선

**Branch:** `codex/foundation`

**Files:** 프로젝트 구성 전체, `electron/**`, `src/app/**`, `src/domain/**`의 공통 타입, `src/services/kioskApi.ts`, `src/styles/**`, 기본 데이터와 테스트 설정

- [ ] 빈 원격 저장소를 `origin`으로 설정하고 최초 기준 브랜치를 `main`으로 만든다.
- [ ] Electron Forge Vite TypeScript 앱을 만들고 React renderer를 연결한다.
- [ ] renderer sandbox, context isolation, disabled node integration과 kiosk BrowserWindow를 설정한다.
- [ ] 위 공통 타입, Zod 스키마, typed preload 계약을 구현한다.
- [ ] JSON을 임시 파일에 쓴 뒤 rename하는 atomic local store를 구현한다.
- [ ] 기본 카탈로그·설정·결제 데이터를 앱 최초 실행 시 사용자 데이터 폴더로 복사한다.
- [ ] React Router, Zustand store 기반, CSS 토큰과 공통 레이아웃을 만든다.
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run make` 명령을 고정한다.
- [ ] 보안 설정, 저장 경로, schema validation과 기본 라우트 테스트를 작성한다.
- [ ] 실행·테스트·패키징이 모두 성공한 커밋을 만들고 PR로 `main`에 병합한다.

## Task 2: Welcome & Shell

**Branch:** `codex/welcome-shell`

**Files:** `src/features/welcome/**`, 필요한 앱 셸 테스트

- [ ] 관리자 설정의 배경 이미지, 위치, 확대값과 문구를 읽는 웰컴 화면 테스트를 먼저 작성한다.
- [ ] 9:16 기준 cover 배경, HIGHEST 장식과 `굿즈 사러가기` 버튼을 구현한다.
- [ ] 버튼이 `/shop`으로 이동하고 기존 장바구니는 유지되는지 테스트한다.
- [ ] 로고 길게 누르기로 `/admin/login`에 들어가는 숨은 진입 동작을 구현한다.
- [ ] 키보드와 터치 입력, 48px 이상 터치 영역과 화면 비율을 검증한다.

## Task 3: Catalog & Cart

**Branch:** `codex/catalog-cart`

**Files:** `src/features/catalog/**`, `src/domain/cart/**`

- [ ] 카테고리 필터, 상품 정렬, 품절·숨김 처리 테스트를 작성한다.
- [ ] 두 열 1:1 상품 카드, 숨겨진 상품 목록 스크롤바와 카테고리 탭을 구현한다.
- [ ] 장바구니 추가·증감·삭제·최대 수량 로직을 Zustand에 구현한다.
- [ ] 하단 장바구니의 독립 스크롤과 표시되는 스크롤바, 고정 합계·구매 버튼을 구현한다.
- [ ] `처음으로`의 빈 장바구니 즉시 이동과 비어 있지 않을 때 확인창을 테스트한다.
- [ ] 상품 카드가 `/products/:productId`, 구매 버튼이 `/checkout`으로 이동하는지 검증한다.

## Task 4: Product Detail

**Branch:** `codex/product-detail`

**Files:** `src/features/product-detail/**`

- [ ] 유효·없는·품절·숨김 상품 라우트 상태 테스트를 작성한다.
- [ ] 1:1 갤러리, 페이지 표시, 상품 설명과 상세 정보 화면을 구현한다.
- [ ] 수량 합계, 최대 수량, 장바구니 담기와 바로 구매 동작을 구현한다.
- [ ] 목록 카테고리와 스크롤 위치를 복원하는 뒤로가기 동작을 검증한다.

## Task 5: Checkout & Payment

**Branch:** `codex/checkout-payment`

**Files:** `src/features/checkout/**`, `src/domain/order/**`, `electron/ipc/orderIpc.ts`

- [ ] 주문 목록 내부 스크롤과 고정 합계·결제 영역 테스트를 작성한다.
- [ ] 결제 직전 가격·판매 상태·최대 수량 재검증을 구현한다.
- [ ] 즉시 완료, 계좌·QR 안내, 결제 시뮬레이션 UI를 구현한다.
- [ ] 계좌·QR 모드에서 `결제 완료` 표현이 나오지 않는지 테스트한다.
- [ ] 중복 입력 잠금, 성공·실패 시뮬레이션과 주문 1회 생성 보장을 구현한다.

## Task 6: Completion & Session

**Branch:** `codex/completion-session`

**Files:** `src/features/completion/**`, `src/domain/session/**`

- [ ] 결제 모드별 제목, 주문 번호, 총액과 수령 안내 테스트를 작성한다.
- [ ] 20초 자동 초기화와 마지막 5초 카운트다운을 구현한다.
- [ ] 고객 화면 90초 유휴 + 15초 경고 후 초기화를 구현한다.
- [ ] 결제 처리 중 유휴 타이머가 중지되는지 테스트한다.
- [ ] 완료 후 장바구니와 세션이 한 번만 초기화되는지 검증한다.

## Task 7: Admin

**Branch:** `codex/admin`

**Files:** `src/features/admin/**`, `electron/ipc/adminIpc.ts`, `electron/ipc/backupIpc.ts`, 관리자 전용 테스트

- [ ] 로그인, 5분 자동 로그아웃과 비밀번호 변경 테스트를 작성한다.
- [ ] 상품 CRUD, 복제, 숨김, 품절, 순서, 최대 수량과 1:1 이미지 입력 UI를 구현한다.
- [ ] 카테고리 관리와 삭제 불가능한 `전체` 동작을 구현한다.
- [ ] 웰컴 배경 위치·확대 미리보기와 결제 모드 설정을 구현한다.
- [ ] 백업 내보내기, 검증된 가져오기와 실패 시 원본 유지 동작을 구현한다.
- [ ] 고객 화면 재진입 시 관리자 변경 내용이 반영되는지 테스트한다.

## Task 8: Integration & QA

**Branch:** `codex/integration-qa`

**Files:** `e2e/**`, 필요한 통합 수정, CI 설정

- [ ] 상품 추가부터 세 가지 결제 모드 완료까지 Playwright 전체 흐름을 작성한다.
- [ ] 관리자 상품·배경·결제 설정 변경이 고객 화면에 반영되는 흐름을 작성한다.
- [ ] 9:16 기준, 작은 세로 화면과 큰 세로 화면 시각 회귀 스냅샷을 작성한다.
- [ ] 키보드 포커스, 터치 목표 크기, 빈 상태와 오류 상태를 점검한다.
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run make`를 모두 실행한다.
- [ ] 발견된 결함만 최소 수정하고 최종 Windows 설치 파일 생성 절차를 문서화한다.

## 병합 규칙

1. 각 스레드는 최신 `main`에서 자신의 브랜치를 만든다.
2. 프롬프트에서 지정한 소유 파일 밖의 수정은 원칙적으로 금지한다.
3. 공통 계약 변경이 필요하면 화면 스레드에서 임의 변경하지 않고 Foundation 후속 PR로 먼저 반영한다.
4. 모든 PR은 테스트 결과, 변경 파일, 남은 위험을 본문에 기록한다.
5. `package.json`, lockfile, router, preload 계약과 전역 CSS는 Foundation 소유다. 후속 스레드가 변경해야 하면 별도 공통 변경 커밋으로 분리한다.
6. 화면 PR은 squash하지 않아도 되지만 한 기능 단위로 이해 가능한 커밋을 유지한다.
7. Integration 스레드는 기능 재설계를 하지 않고 연결 결함과 회귀만 수정한다.

## 최종 완료 조건

- 모든 기능 명세 승인 조건을 자동 또는 수동 테스트로 추적할 수 있다.
- 고객 화면에서 실제 결제 성공으로 오인할 표현이 없다.
- 상품·카테고리·웰컴 이미지·결제 설정이 재빌드 없이 관리자에서 변경된다.
- 네트워크 없이 앱을 재시작해도 설정과 상품 이미지가 유지된다.
- Windows 설치 패키지가 생성되고 세로 키오스크에서 전체화면으로 실행된다.
- 원격 `main`에서 lint, typecheck, unit, e2e와 package가 성공한다.
