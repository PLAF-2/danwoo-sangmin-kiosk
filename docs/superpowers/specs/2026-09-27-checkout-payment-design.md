# Checkout & Payment 설계

## 범위

`/checkout` 주문 확인, 결제 직전 재검증, `/processing` 처리와 주문 생성만 구현한다. 완료 화면과 세션 초기화는 후속 Completion 스레드가 맡는다.

## 구조

- `src/domain/order`: 장바구니와 최신 카탈로그를 비교하는 순수 검증 함수
- `src/features/checkout`: 주문 확인 화면, 가격 변경 재확인, 결제 모드별 안내, 처리 화면
- `electron/ipc/orderIpc.ts`: 기존의 가격·판매 상태·최대 수량 재검증과 `requestId` 멱등 저장 계약을 유지
- `src/app/router.tsx`: checkout과 processing placeholder만 실제 화면으로 교체

별도 전역 결제 스토어나 새 의존성은 추가하지 않는다. 처리 화면에 필요한 항목, 결제 설정과 `requestId`는 React Router state로 전달하며 state 없이 직접 접근하면 `/checkout`으로 돌려보낸다.

## 흐름

1. Checkout이 장바구니, 카탈로그와 결제 설정을 읽어 주문 내역을 표시한다.
2. 최종 버튼 클릭 즉시 동기 잠금을 건 뒤 카탈로그와 결제 설정을 다시 읽는다.
3. 품절·숨김·삭제·최대 수량 초과는 결제를 막는다.
4. 가격 변경은 변경 상품과 새 합계를 표시한다. 같은 최신 가격에 대한 두 번째 확인만 처리 화면으로 이동한다.
5. Processing은 설정 시간과 simulation 결과를 먼저 확정한 뒤 `orders.create`를 호출한다.
6. `paid` 또는 `received`는 `/complete/:orderNumber`로 이동하고 `failed`는 재시도와 `/shop` 복귀를 제공한다.
7. 재시도는 새 `requestId`를 만들며, 같은 처리 시도의 중복 호출은 기존 IPC 멱등성으로 같은 주문을 받는다.

## 문구와 오류 처리

- `bankQr`에서는 `결제 완료`를 렌더링하지 않고 주문 접수와 운영자 확인 안내만 표시한다.
- 빈 장바구니는 최종 버튼을 비활성화한다.
- 읽기 또는 주문 생성 실패는 화면에 안내하고 안전하게 재시도하거나 `/shop`으로 돌아갈 수 있게 한다.

## 검증

Vitest로 내부 스크롤·고정 영역, 빈 장바구니, 가격·판매 상태·최대 수량 변경, 세 모드, bankQr 금지 문구, 더블 클릭, 성공·실패·재시도를 먼저 실패시키고 최소 구현으로 통과시킨다. 마지막에 lint, typecheck, 전체 test와 모드별 화면 캡처를 실행한다.
