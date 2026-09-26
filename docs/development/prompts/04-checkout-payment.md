# Thread 04 — Checkout & Payment

아래 내용을 새 개발 스레드의 첫 메시지로 그대로 사용한다.

---

당신은 HIGHEST 굿즈 키오스크의 주문 확인과 결제 시뮬레이션 스레드를 담당한다.

저장소는 `https://github.com/PLAF-2/danwoo-sangmin-kiosk.git`이다. Foundation과 Catalog & Cart PR이 `main`에 병합된 것을 확인하고 최신 `main`에서 `codex/checkout-payment` 브랜치를 만들어라.

작업 전에 아래 자료를 전부 읽어라.

- `HIGHEST_HORIZON_CONCEPT.md`
- `docs/superpowers/specs/2026-09-26-highest-kiosk-functional-design.md`
- `docs/superpowers/plans/2026-09-26-kiosk-threaded-development.md`
- `docs/development/THREAD_EXECUTION_GUIDE.md`
- `docs/design-references/04-checkout.png`

주 소유 범위는 `src/features/checkout/**`, `src/domain/order/**`, `electron/ipc/orderIpc.ts`다. 실제 금융 결제, PG 연동이나 입금 자동 확인은 범위 밖이다.

필수 구현:

1. `/checkout`에서 주문 상품, 수량, 행 합계, 상품 금액, 할인과 최종 금액을 표시한다.
2. 주문 상품 영역만 세로 스크롤되고 오른쪽에 현재 위치를 나타내는 스크롤 표시가 보여야 한다.
3. 합계, 결제 방식과 최종 행동 버튼은 상품 목록 스크롤과 무관하게 고정한다.
4. `주문 수정하기`와 상단 뒤로가기는 `/shop`으로 돌아가며 장바구니를 유지한다.
5. 최종 행동 전에 상품의 현재 가격, 노출, 품절, 최대 수량을 다시 읽고 장바구니와 비교한다.
6. 가격이 바뀌면 변경 상품과 새 금액을 보여 주고 재확인을 받는다. 판매 불가 상품은 결제를 막는다.
7. 관리자 설정에 따라 세 모드를 제공한다.
   - `instant`: `결제하기`, 짧은 처리 후 paid
   - `bankQr`: 계좌·예금주·QR과 `입금했어요`, 자동 확인 없이 received
   - `simulation`: `결제 시뮬레이션`, 설정에 따라 paid 또는 failed
8. bankQr 모드에서는 어느 화면에도 `결제 완료`라고 쓰지 말고 `주문 접수`와 운영자 확인 안내를 사용한다.
9. 최종 버튼을 처음 누른 즉시 잠그고 중복 주문 생성 요청을 막는다.
10. `/processing`의 대기 애니메이션과 simulation 결과 판단을 먼저 끝낸 뒤 `orders.create`를 호출한다. main process는 terminal 상태(`instant=paid`, `bankQr=received`, simulation 성공=`paid`, 실패=`failed`)의 주문 번호를 한 번만 생성·저장한다. 같은 `requestId` 재호출은 같은 주문을 반환하고, 실패 후 새 결제 시도에는 새 `requestId`를 사용한다.
11. 처리 성공 시 `/complete/:orderNumber`, 실패 시 재시도 또는 `/shop` 복귀를 제공한다.

먼저 실패하는 테스트를 작성하고 다음을 검증한다.

- 주문 목록 내부 스크롤과 고정 영역
- 빈 장바구니의 결제 차단
- 가격·품절·최대 수량 변경 재검증
- 세 결제 모드의 버튼과 상태
- bankQr 금지 문구
- 더블 클릭에도 주문 1건 생성
- 성공, 실패, 다시 시도와 라우트 이동

`npm run lint`, `npm run typecheck`, `npm test`를 실행하고 모드별 스크린샷을 남겨라. 커밋과 push 후 PR을 준비하되 직접 병합하지 마라. Completion 스레드가 사용할 Order 상태와 저장·조회 계약을 완료 보고에 적어라.
