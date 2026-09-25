# Thread 00 — Foundation

아래 내용을 새 개발 스레드의 첫 메시지로 그대로 사용한다.

---

당신은 HIGHEST 굿즈 키오스크의 Foundation 스레드를 담당한다.

저장소는 `https://github.com/PLAF-2/danwoo-sangmin-kiosk.git`이고, 이 저장소는 아직 비어 있으므로 최초 실행 가능한 기준선을 만드는 것이 목표다. 작업 브랜치는 `codex/foundation`, 기준 브랜치는 `main`이다. 기존 로컬 문서가 있다면 보존하고 임의로 덮어쓰지 마라.

작업 전에 다음 파일을 전부 읽고 요구사항으로 취급하라.

- `HIGHEST_HORIZON_CONCEPT.md`
- `docs/superpowers/specs/2026-09-26-highest-kiosk-functional-design.md`
- `docs/superpowers/plans/2026-09-26-kiosk-threaded-development.md`
- `docs/development/THREAD_EXECUTION_GUIDE.md`
- `docs/design-references/*.png`

Electron + React + TypeScript 앱의 공통 기반만 구현한다. Electron Forge의 Vite TypeScript 템플릿을 사용하고 React renderer를 연결한다. npm을 사용하며 lockfile을 커밋한다. `package.json`에 최소한 `start`, `lint`, `typecheck`, `test`, `test:e2e`, `make` 스크립트를 정의한다.

필수 구현 범위:

1. Electron `BrowserWindow`를 9:16 세로 키오스크에 맞춰 실행하고 운영 빌드에서 kiosk 모드를 사용한다.
2. `nodeIntegration: false`, `contextIsolation: true`, renderer sandbox를 유지한다.
3. main/preload/renderer를 분리하고 renderer에는 `window.kiosk` typed API만 공개한다.
4. 계획 문서의 Category, Product, CartItem, Order, AppSettings, PaymentSettings 타입과 Zod 검증을 구현한다.
5. 카탈로그, 설정, 결제 설정, 주문, 관리자 인증, 미디어 가져오기, 백업을 위한 IPC 계약을 만든다.
6. 실제 저장은 앱 사용자 데이터 폴더 안의 JSON과 이미지 폴더를 사용한다. JSON은 임시 파일 기록 후 rename하여 원자적으로 교체한다.
7. 최초 실행 시 `data/defaults`의 샘플 데이터를 사용자 데이터 폴더로 복사한다.
8. React Router에 계획 문서의 모든 경로를 등록하되 아직 구현되지 않은 화면은 명확한 임시 라우트 컴포넌트로 둔다.
9. Zustand 기반 장바구니·세션 store의 최소 계약을 만든다. 화면 구현은 하지 않는다.
10. 브랜드 컬러, 타이포그래피, 간격, radius, shadow를 `src/styles/tokens.css`에 정의하고 전역 reset을 만든다.
11. Vitest, React Testing Library, Playwright 기본 설정과 공통 fixture를 만든다.
12. README에 개발 실행, 테스트, Windows 패키징, 로컬 데이터 위치와 관리자 초기 비밀번호 설정 방법을 기록한다. 초기 비밀번호를 소스에 평문으로 고정하지 마라.

소유 파일은 프로젝트 설정, `electron/**`, `src/app/**`, `src/domain/**`의 공통 계약, `src/services/kioskApi.ts`, `src/styles/**`, `src/test/**`, `data/defaults/**`다. 고객 화면과 관리자 화면의 최종 UI는 만들지 마라.

테스트 우선으로 진행한다. 최소한 schema validation, atomic JSON 저장, preload 공개 API 제한, 기본 라우트, 장바구니 store의 추가·삭제·최대 수량 동작을 검증한다. 이후 모든 명령을 실행한다.

```text
npm run lint
npm run typecheck
npm test
npm run make
```

작업을 작은 커밋으로 남기고 원격 브랜치에 push한 뒤 PR을 준비하라. 직접 `main`에 병합하지 마라. 완료 보고에는 브랜치, 최종 커밋, 변경 파일, 검증 결과, 후속 스레드가 사용할 API와 남은 위험을 적어라.
