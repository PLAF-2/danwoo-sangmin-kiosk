# Thread 07 — Integration & QA

아래 내용을 새 개발 스레드의 첫 메시지로 그대로 사용한다.

---

당신은 HIGHEST 굿즈 키오스크의 최종 통합과 QA 스레드를 담당한다.

저장소는 `https://github.com/PLAF-2/danwoo-sangmin-kiosk.git`이다. Foundation, Welcome, Catalog, Product Detail, Checkout, Completion, Admin PR이 모두 `main`에 병합된 것을 확인한 뒤 최신 `main`에서 `codex/integration-qa` 브랜치를 만들어라.

작업 전에 아래 자료를 전부 읽어라.

- `HIGHEST_HORIZON_CONCEPT.md`
- `docs/superpowers/specs/2026-09-26-highest-kiosk-functional-design.md`
- `docs/superpowers/plans/2026-09-26-kiosk-threaded-development.md`
- `docs/development/THREAD_EXECUTION_GUIDE.md`
- `docs/design-references/*.png`

이 스레드의 목표는 기능을 새로 설계하는 것이 아니라, 병합된 기능이 하나의 키오스크로 연결되는지 검증하고 통합 결함만 최소 수정하는 것이다. 주 소유 범위는 `e2e/**`, CI 설정, 통합 과정에서 발견된 결함 수정이다.

필수 QA 시나리오:

1. 웰컴 → 상품 카테고리 → 상품 상세 → 장바구니 → 주문 확인 → instant 완료 → 자동 초기화.
2. 목록의 `+`로 여러 상품을 담고 하단 장바구니를 스크롤하며 수량을 수정한다.
3. 상품과 주문 목록이 각각 명세대로 스크롤되고 스크롤 표시 규칙이 맞는지 확인한다.
4. bankQr 모드에서 계좌·QR이 표시되고 최종 화면이 `주문 접수`라고 표현되는지 확인한다.
5. simulation 성공과 실패·재시도를 확인한다.
6. 관리자에서 상품명, 가격, 1:1 이미지, 카테고리와 품절 상태를 바꾼 뒤 고객 화면에 반영되는지 확인한다.
7. 관리자에서 웰컴 배경과 결제 모드를 바꾼 뒤 재빌드 없이 반영되는지 확인한다.
8. 앱 재시작 후 로컬 데이터와 이미지가 유지되는지 확인한다.
9. 잘못된 이미지, 손상된 JSON, 없는 상품, 빈 장바구니와 없는 주문 번호의 fallback을 확인한다.
10. 90초 고객 유휴 초기화, 5분 관리자 로그아웃, 20초 완료 초기화를 가짜 타이머 또는 단축 테스트 설정으로 검증한다.
11. 빠른 연속 터치에도 상품 추가와 주문 생성이 의도치 않게 중복되지 않는지 확인한다.
12. 9:16 기준 해상도와 작은·큰 세로 viewport에서 핵심 버튼이 가려지지 않는지 스크린샷으로 비교한다.

Playwright 테스트는 고객 전체 흐름과 관리자 편집 흐름으로 분리한다. 테스트가 발견한 결함은 먼저 재현 테스트를 추가한 뒤 최소 수정한다. 디자인 취향에 따른 전면 재작업이나 공통 구조 리팩터링은 하지 마라.

최종 검증:

```text
npm ci
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run make
```

Windows 패키지 생성 위치와 설치·실행 방법을 README에 기록한다. 코드 서명 인증서가 없다면 서명되지 않은 테스트 빌드라는 점만 문서화하고 가짜 인증서를 만들지 마라.

작업을 커밋하고 push한 뒤 PR을 준비하라. 완료 보고에는 각 명세 승인 조건과 대응 테스트, 전체 명령 결과, 스크린샷 경로, 남은 운영 위험을 포함한다. 직접 `main`에 병합하거나 릴리스를 배포하지 마라.
