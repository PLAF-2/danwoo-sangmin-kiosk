# HIGHEST Kiosk

HIGHEST 굿즈 판매용 웹 키오스크입니다. React 화면은 Vite로 빌드하고, 주문·관리자 API는 Vercel Functions(`api/`)에서 Neon Postgres와 Vercel Blob을 사용합니다.

## 개발 환경

- Node.js: `^20.19.0` 또는 `>=22.12.0` (`package.json`의 `engines` 기준)
- 권장 환경: Node.js 22.12 이상

```bash
npm install
npm run dev
```

`npm run dev`는 화면과 `/api` 함수를 함께 띄웁니다. `DATABASE_URL`이 셸 환경에 없으면 메모리 안의 Postgres(PGlite)를 만들고 [`api/schema.sql`](api/schema.sql)과 `data/defaults`의 기본 데이터를 넣습니다. 이때 관리자 비밀번호는 `admin0000`이고, 서버를 다시 시작하면 주문·수정 내용은 초기화됩니다. 로컬에서는 Blob 토큰이 없으므로 관리자 이미지 업로드는 동작하지 않습니다.

실제 DB로 로컬 실행하려면 `DATABASE_URL`(필요하면 `BLOB_READ_WRITE_TOKEN`)을 셸에 지정한 뒤 `npm run dev`를 실행합니다. `.env.local`은 자동으로 읽지 않으므로 운영 DB에 실수로 쓰지 않도록 주의하십시오.

## 명령

| 명령 | 동작 |
|---|---|
| `npm run dev` | 화면 + 로컬 API 개발 서버 실행 |
| `npm run build` | 정적 파일을 `dist/`에 빌드 |
| `npm run build:vercel` | Vercel 빌드 명령. `DATABASE_URL`이 있으면 `db:setup`을 먼저 실행한 뒤 빌드 |
| `npm run db:setup` | `DATABASE_URL`의 DB에 schema 적용(반복 실행 가능) + 빈 DB면 기본 데이터·초기 관리자 설치 |
| `npm run db:reset-catalog` | `db:setup` 후 카테고리·상품을 `data/defaults/catalog.json`으로 교체(주문·설정·비밀번호는 유지) |
| `npm run lint` | 전체 저장소 ESLint 검사 |
| `npm run typecheck` | 화면, 단위 테스트, E2E, API TypeScript 설정 검사 |
| `npm test` | Vitest 단위·컴포넌트·API 테스트 1회 실행 |
| `npm run test:e2e` | 별도 웹 환경의 영속성 검사(주소·비밀번호 미지정 시 skip) |

## 기본 데이터

`data/defaults/`는 빌드 시 그대로 공개 폴더가 되어 `/images/...` 주소로 제공되고, DB seed의 원본으로도 쓰입니다.

- `catalog.json`: 카테고리와 상품. 이미지 경로는 `images/<파일명>` 형식입니다.
- `settings.json`, `payment.json`: 웰컴 화면과 결제 안내 기본값
- `images/`: 상품·웰컴 이미지. 상품 이미지는 1:1 비율 WebP를 사용합니다.

상품에 선택 옵션이 있으면 `options`에 옵션 이름과 값 목록을 넣습니다. 옵션이 없는 상품은 `options`를 생략합니다. 손님은 담을 때 모든 옵션을 하나씩 골라야 하고, 같은 상품이라도 선택 값이 다르면 장바구니·주문에 별도 줄로 저장됩니다. 최대 수량은 옵션을 합친 상품 전체 기준입니다.

```json
"options": [{ "name": "인형", "values": ["단우", "상민"] }]
```

관리자 화면의 상품 수정 창에서는 한 줄에 `옵션명:값1,값2` 형식으로 입력합니다. 상품 관리 화면의 **기본 굿즈 불러오기** 버튼은 카테고리·상품을 이 `catalog.json` 내용으로 한 번에 교체합니다(주문, 화면·결제 설정은 유지).

## Vercel 배포

저장소 루트를 Vercel 프로젝트에 연결합니다. `vercel.json`은 `npm run build:vercel`, 출력 `dist/`, `/api`를 제외한 SPA 경로 재작성을 지정합니다. 실제 실행에는 아래 리소스가 필요합니다.

1. [Vercel Marketplace의 Neon](https://vercel.com/marketplace/neon/neon)을 연결하고 Postgres DB를 만듭니다. 프로젝트 환경 변수의 `DATABASE_URL`이 해당 DB 연결 문자열인지 확인합니다.
2. 프로젝트에 **Public** [Vercel Blob 스토어](https://vercel.com/docs/vercel-blob)를 연결하고 `BLOB_READ_WRITE_TOKEN`을 설정합니다. 업로드된 이미지는 공개 HTTPS URL로 표시하므로 Private 스토어는 사용할 수 없습니다.
3. 사용할 Development / Preview / Production 환경마다 변수를 설정합니다. 두 변수 모두 서버 전용이며 `VITE_` 접두사를 붙이면 안 됩니다.

변수 이름은 [`.env.example`](.env.example)에 있습니다. 실제 값은 Vercel 환경 변수 또는 Git에서 제외되는 `.env.local`에만 저장합니다. 관리자 세션은 무작위 토큰의 해시·만료 시간을 DB의 `admin_sessions`에 저장합니다. 쿠키는 HttpOnly/Secure/SameSite=Lax이고 유휴 만료는 5분입니다.

### DB 준비와 업그레이드

배포할 때마다 Vercel 빌드가 그 환경의 `DATABASE_URL`로 [`scripts/setup-db.ts`](scripts/setup-db.ts)를 먼저 실행합니다. 이 스크립트는 `api/schema.sql`을 문장별로 적용합니다. 모든 문장이 `IF NOT EXISTS`라서 기존 DB에 반복 실행해도 데이터가 지워지지 않고, 필요한 컬럼(예: 옵션 기능의 `products.options`, `order_items.selected_options`)만 추가됩니다. 그 다음 DB가 비어 있을 때만 기본 카테고리·상품·설정을 넣고, 관리자 자격 증명이 없을 때만 초기 비밀번호 `admin0000`의 scrypt 해시를 만듭니다. 첫 로그인 후 `/admin/system`에서 비밀번호를 바꾸십시오. DB에 연결할 수 없으면 빌드가 실패하므로 깨진 배포가 올라가지 않습니다.

이미 판매 데이터가 있는 DB의 상품 목록을 기본 굿즈로 바꾸려면 배포 후 관리자 **상품 관리 → 기본 굿즈 불러오기**를 누릅니다. 같은 작업을 명령으로 하려면 다음을 실행합니다.

```bash
npx vercel link
npx vercel env pull .env.local
node --env-file=.env.local --import=tsx scripts/setup-db.ts --reset-catalog
```

배포 전 검증 순서는 다음과 같습니다.

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

### 선택 실행형 웹 영속성 검사

[`e2e/web-persistence.spec.ts`](e2e/web-persistence.spec.ts)는 실제 API·Neon·Blob에 연결합니다. **전용 테스트 환경**을 준비하고 `WEB_E2E_BASE_URL`과 `WEB_E2E_ADMIN_PASSWORD`를 테스트 프로세스 환경에 지정한 뒤 실행합니다. Vercel 로그인 보호가 있다면 테스트 브라우저가 접근 가능한 전용 테스트 배포를 사용하십시오.

```bash
npx playwright install chromium
npm run test:e2e
```

두 변수 중 하나라도 없으면 테스트는 skip합니다. 검사는 관리자 로그인 → PNG 업로드 → 상품 생성 → 새 고객 세션에서 목록 새로고침 → 같은 `requestId` 동시 주문의 동일 결과 → 다른 주문 내용으로 재사용 시 409를 확인하고, 종료 시 생성한 상품만 제거합니다. 카탈로그 저장은 전체 교체 방식이므로 검사 중 다른 관리자 편집을 하지 마십시오.

## 문제 해결

- 화면은 뜨는데 상품이 비어 있으면 `/api/catalog` 응답을 확인합니다. 배포 환경이라면 `DATABASE_URL`과 `scripts/setup-db.ts` 적용 여부를, 로컬이라면 `npm run dev` 로그의 `in-memory database seeded` 문구를 확인합니다.
- 배포 후 `column "options" does not exist` 오류가 나면 해당 DB에 `scripts/setup-db.ts`를 실행하지 않은 것입니다.
- 관리자 이미지 업로드가 실패하면 `BLOB_READ_WRITE_TOKEN`과 Blob 스토어가 Public인지 확인합니다.
- Playwright가 브라우저 실행 파일을 찾지 못하면 `npx playwright install chromium`을 실행합니다.

프로젝트 기능 기준은 [`docs/superpowers/specs/2026-09-26-highest-kiosk-functional-design.md`](docs/superpowers/specs/2026-09-26-highest-kiosk-functional-design.md)에 있습니다. `docs/`의 초기 계획 문서에는 제거된 Electron 데스크톱 버전 내용이 남아 있습니다.
