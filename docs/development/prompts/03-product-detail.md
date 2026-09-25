# Thread 03 — Product Detail

아래 내용을 새 개발 스레드의 첫 메시지로 그대로 사용한다.

---

당신은 HIGHEST 굿즈 키오스크의 상품 상세 화면 스레드를 담당한다.

저장소는 `https://github.com/PLAF-2/danwoo-sangmin-kiosk.git`이다. Foundation과 Catalog & Cart PR이 모두 `main`에 병합된 뒤 최신 `main`에서 `codex/product-detail` 브랜치를 만들어라.

작업 전에 아래 자료를 전부 읽어라.

- `HIGHEST_HORIZON_CONCEPT.md`
- `docs/superpowers/specs/2026-09-26-highest-kiosk-functional-design.md`
- `docs/superpowers/plans/2026-09-26-kiosk-threaded-development.md`
- `docs/development/THREAD_EXECUTION_GUIDE.md`
- `docs/design-references/03-product-detail.png`

주 소유 범위는 `src/features/product-detail/**`다. 기존 Product 타입과 cart store를 그대로 사용하고 같은 기능을 다시 만들지 마라.

필수 구현:

1. `/products/:productId`에서 상품을 읽고 대표 이미지, 상세 이미지, 이름, 가격, 설명, 상세 규격을 표시한다.
2. 모든 이미지 프레임은 1:1이고 여러 상세 이미지는 가로 스와이프 또는 썸네일로 확인한다.
3. 갤러리 스크롤바는 숨기고 현재 위치는 페이지 점이나 선택 썸네일로 보여 준다.
4. 수량을 1부터 상품 최대 수량까지 조절하고 선택 수량의 합계를 즉시 계산한다.
5. `장바구니 담기`는 현재 화면에 머물며 성공 피드백을 표시한다.
6. `바로 구매`는 수량을 장바구니에 합친 뒤 `/checkout`으로 이동한다.
7. 뒤로가기는 `/shop`의 선택 카테고리와 스크롤 위치가 복원되도록 기존 목록 상태 계약을 사용한다.
8. 없는 상품, 숨김 상품, 품절 상품을 명확히 처리한다. 품절은 담기와 바로 구매를 막는다.
9. 이미지 실패 시 브랜드 기본 이미지를 사용한다.

먼저 테스트를 작성하고 정상 상품, 없는 상품, 숨김, 품절, 최대 수량, 장바구니 합산, 바로 구매와 뒤로가기 상태 복원을 검증하라. `npm run lint`, `npm run typecheck`, `npm test`를 실행하고 9:16 화면 스크린샷을 남겨라.

작업을 커밋하고 push한 뒤 PR을 준비하되 직접 병합하지 마라. 공통 store나 타입 수정이 필요하면 상세 화면 코드와 분리된 커밋으로 만들고 완료 보고에 이유를 적어라.
