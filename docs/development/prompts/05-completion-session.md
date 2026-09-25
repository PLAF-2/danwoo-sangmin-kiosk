# Thread 05 — Completion & Session

아래 내용을 새 개발 스레드의 첫 메시지로 그대로 사용한다.

---

당신은 HIGHEST 굿즈 키오스크의 완료 화면과 고객 세션 타이머 스레드를 담당한다.

저장소는 `https://github.com/PLAF-2/danwoo-sangmin-kiosk.git`이다. Foundation, Catalog & Cart, Checkout & Payment PR이 `main`에 병합된 뒤 최신 `main`에서 `codex/completion-session` 브랜치를 만들어라.

작업 전에 아래 자료를 전부 읽어라.

- `HIGHEST_HORIZON_CONCEPT.md`
- `docs/superpowers/specs/2026-09-26-highest-kiosk-functional-design.md`
- `docs/superpowers/plans/2026-09-26-kiosk-threaded-development.md`
- `docs/development/THREAD_EXECUTION_GUIDE.md`
- `docs/design-references/05-payment-complete.png`

주 소유 범위는 `src/features/completion/**`와 `src/domain/session/**`다. 기존 Order와 cart store 계약을 그대로 사용한다.

필수 구현:

1. `/complete/:orderNumber`에서 저장된 주문을 조회해 주문 번호, 총액, 결제 방식과 수령 안내를 표시한다.
2. instant는 `결제가 완료되었습니다`, bankQr은 `주문이 접수되었습니다`, simulation은 `결제 시뮬레이션이 완료되었습니다`를 사용한다.
3. 존재하지 않는 주문 번호에는 안전한 오류 상태와 처음으로 버튼을 제공한다.
4. 완료 화면 진입 시 장바구니를 한 번만 비운다. 다시 렌더링되어도 다른 상태를 반복 삭제하거나 주문을 변경하지 않는다.
5. `처음으로`는 세션을 초기화하고 `/`로 이동한다.
6. 입력이 없으면 완료 화면은 20초 후 자동 초기화하고, 마지막 5초를 화면에 표시한다.
7. 일반 고객 화면에서 90초간 입력이 없으면 15초 경고창을 표시하고, 계속 사용하지 않으면 장바구니와 화면 상태를 비운 뒤 `/`로 이동한다.
8. 경고창의 `계속 이용하기`는 타이머를 다시 시작한다.
9. `/processing`에서는 유휴 타이머를 멈추고 결제가 끝난 뒤 다시 적용한다.
10. 관리자 경로에는 고객 유휴 타이머를 적용하지 않는다.

가짜 타이머를 사용한 테스트를 먼저 작성해 90초, 15초, 20초, 5초 경계를 정확히 검증하라. 결제 모드별 제목, 없는 주문, 수동 초기화, 자동 초기화와 처리 중 일시 중지를 테스트하라.

`npm run lint`, `npm run typecheck`, `npm test`를 실행하고 완료 화면 스크린샷을 남겨라. 커밋과 push 후 PR을 준비하되 직접 병합하지 마라.
