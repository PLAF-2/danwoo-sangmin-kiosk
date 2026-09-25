# Thread 02 — Catalog & Cart

아래 내용을 새 개발 스레드의 첫 메시지로 그대로 사용한다.

---

당신은 HIGHEST 굿즈 키오스크의 상품 목록과 장바구니 스레드를 담당한다.

저장소는 `https://github.com/PLAF-2/danwoo-sangmin-kiosk.git`이다. Foundation PR이 `main`에 병합된 것을 확인하고 최신 `main`에서 `codex/catalog-cart` 브랜치를 만들어라.

작업 전에 아래 자료를 전부 읽어라.

- `HIGHEST_HORIZON_CONCEPT.md`
- `docs/superpowers/specs/2026-09-26-highest-kiosk-functional-design.md`
- `docs/superpowers/plans/2026-09-26-kiosk-threaded-development.md`
- `docs/development/THREAD_EXECUTION_GUIDE.md`
- `docs/design-references/02-catalog.png`

주 소유 범위는 `src/features/catalog/**`와 `src/domain/cart/**`다. 공통 타입, preload, dependencies, router, 전역 토큰을 중복 정의하거나 임의 변경하지 마라.

필수 구현:

1. 왼쪽 위 `처음으로`, 중앙 로고, 로고 바로 아래 카테고리, 두 열 상품 그리드, 하단 장바구니를 구성한다.
2. 모든 상품 대표 이미지는 1:1 프레임에서 잘림 규칙이 일관되어야 한다.
3. 상품 영역은 세로 스크롤되지만 스크롤바를 표시하지 않는다.
4. 카테고리 탭은 `전체`를 첫 항목으로 표시하고 필요하면 가로 스크롤하되 스크롤바를 숨긴다.
5. 숨김 상품과 비활성 카테고리는 노출하지 않는다. 품절 상품은 보이되 담을 수 없다.
6. 상품 카드 전체는 `/products/:productId`로 이동하고, 카드의 `+`는 이동 없이 1개를 담는다.
7. 같은 상품은 한 행에서 수량을 합치고 최대 수량을 넘지 않는다.
8. 하단 `내가 담은 굿즈` 목록만 독립적으로 스크롤되며 얇은 스크롤 표시가 보여야 한다.
9. 총수량, 총액, `구매하러 가기` 버튼은 장바구니 목록 스크롤과 무관하게 고정한다.
10. 수량 1에서 감소하면 삭제 확인을 표시한다. 빈 장바구니에서는 구매 버튼을 비활성화한다.
11. `처음으로`는 빈 장바구니면 `/`로 바로 이동하고, 상품이 있으면 비우기 확인 후 이동한다.
12. 구매 버튼은 `/checkout`으로 이동한다.

테스트를 먼저 작성하고 다음을 검증한다.

- 카테고리 필터와 관리자 표시 순서
- 숨김·품절·비활성 상태
- 직접 담기, 증감, 삭제 확인과 최대 수량
- 총수량과 원화 합계 형식
- `처음으로`의 두 분기
- 카드·상세·결제 라우트 이동
- 상품 스크롤바 숨김과 장바구니 스크롤 표시
- 빈 카테고리와 이미지 실패 fallback

`npm run lint`, `npm run typecheck`, `npm test`를 실행하고 화면 스크린샷을 남겨라. 커밋과 push 후 PR을 준비하되 직접 병합하지 마라. Product Detail과 Checkout 스레드가 사용할 cart store 함수와 상태 shape를 완료 보고에 정확히 적어라.
