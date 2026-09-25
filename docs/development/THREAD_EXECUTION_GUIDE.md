# HIGHEST 키오스크 스레드 실행 안내

## 1. 기준 저장소

- GitHub: `https://github.com/PLAF-2/danwoo-sangmin-kiosk.git`
- 기준 브랜치: `main`
- 브랜치 접두사: `codex/`
- 패키지 관리자: `npm`

2026-09-26 확인 당시 원격 저장소는 비어 있었다. 가장 먼저 `00-foundation.md` 프롬프트로 프로젝트 기준선을 만들고 병합해야 한다.

## 2. 실행 순서

| 순서 | 스레드 | 브랜치 | 시작 조건 |
|---|---|---|---|
| 0 | Foundation | `codex/foundation` | 즉시 시작 |
| 1A | Welcome & Shell | `codex/welcome-shell` | Foundation 병합 |
| 1B | Catalog & Cart | `codex/catalog-cart` | Foundation 병합 |
| 1C | Admin | `codex/admin` | Foundation 병합 |
| 2A | Product Detail | `codex/product-detail` | Catalog & Cart 병합 |
| 2B | Checkout & Payment | `codex/checkout-payment` | Catalog & Cart 병합 |
| 3 | Completion & Session | `codex/completion-session` | Checkout & Payment 병합 |
| 4 | Integration & QA | `codex/integration-qa` | 나머지 전부 병합 |

동시에 진행해도 되는 조합은 `Welcome & Shell`, `Catalog & Cart`, `Admin`뿐이다. Product Detail과 Checkout은 장바구니 계약을 소비하므로 Catalog 병합 후 시작한다.

## 3. 새 스레드 시작 방법

1. 해당 순서의 시작 조건이 충족되었는지 확인한다.
2. `docs/development/prompts`에서 해당 프롬프트 전체를 복사한다.
3. 새 개발 스레드의 첫 메시지로 붙여 넣는다.
4. 스레드가 PR 또는 커밋을 완료하면 테스트 결과와 변경 파일 목록을 확인한다.
5. 리뷰·병합 후 다음 의존 스레드를 시작한다.

## 4. 공통 금지 사항

- 기능 명세나 디자인 참조 이미지를 임의 수정하지 않는다.
- 실제 PG, 입금 확인 또는 외부 결제 API를 추가하지 않는다.
- renderer에서 Node.js integration을 켜지 않는다.
- 비밀번호, 계좌번호나 비밀 값을 소스에 하드코딩하지 않는다.
- 각 화면 스레드가 공통 도메인 타입을 중복 정의하지 않는다.
- 다른 스레드 소유 기능까지 함께 리팩터링하지 않는다.
- 검증 없이 `main`에 직접 푸시하지 않는다.

## 5. 충돌을 줄이는 파일 소유권

| 영역 | 주 소유 스레드 |
|---|---|
| 프로젝트 설정, dependencies, Electron main/preload, 공통 타입·스타일·라우터 | Foundation |
| `src/features/welcome/**` | Welcome & Shell |
| `src/features/catalog/**`, `src/domain/cart/**` | Catalog & Cart |
| `src/features/product-detail/**` | Product Detail |
| `src/features/checkout/**`, `src/domain/order/**` | Checkout & Payment |
| `src/features/completion/**`, `src/domain/session/**` | Completion & Session |
| `src/features/admin/**`, 관리자·백업 IPC | Admin |
| `e2e/**`, CI와 통합 결함 | Integration & QA |

공통 파일 변경이 필요하면 해당 화면 PR 안에 섞지 말고 별도 커밋으로 분리하고, 무엇을 왜 바꿨는지 명시한다.

## 6. 모든 스레드의 완료 보고 형식

```text
브랜치:
최종 커밋:
변경한 파일:
구현한 요구사항:
실행한 검증과 결과:
남은 위험 또는 다음 스레드 전달사항:
```

## 7. 관련 문서

- 기능 기준: `docs/superpowers/specs/2026-09-26-highest-kiosk-functional-design.md`
- 전체 구현 계획: `docs/superpowers/plans/2026-09-26-kiosk-threaded-development.md`
- 공식 Electron 패키징 가이드: `https://www.electronjs.org/docs/latest/tutorial/tutorial-packaging`
- Electron 보안 가이드: `https://www.electronjs.org/docs/latest/tutorial/security`
