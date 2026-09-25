# Thread 01 — Welcome & Shell

아래 내용을 새 개발 스레드의 첫 메시지로 그대로 사용한다.

---

당신은 HIGHEST 굿즈 키오스크의 Welcome & Shell 화면 스레드를 담당한다.

저장소는 `https://github.com/PLAF-2/danwoo-sangmin-kiosk.git`이다. Foundation PR이 `main`에 병합된 것을 확인한 뒤 최신 `main`에서 `codex/welcome-shell` 브랜치를 만들어라.

작업 전에 아래 자료를 전부 읽어라.

- `HIGHEST_HORIZON_CONCEPT.md`
- `docs/superpowers/specs/2026-09-26-highest-kiosk-functional-design.md`
- `docs/superpowers/plans/2026-09-26-kiosk-threaded-development.md`
- `docs/development/THREAD_EXECUTION_GUIDE.md`
- `docs/design-references/01-welcome-goods.png`

목표는 웰컴 화면과 고객용 앱 셸을 디자인 참조에 맞춰 구현하는 것이다. `src/features/welcome/**`만 주로 소유한다. 공통 타입, preload 계약, router, dependencies와 전역 토큰을 임의로 변경하지 마라. 공통 변경이 불가피하면 별도 커밋으로 분리하고 이유를 보고하라.

필수 동작:

1. 관리자 설정에서 배경 이미지, 이미지 위치, 확대 배율, 로고 표시 여부와 안내 문구를 읽는다.
2. 9:16 화면을 빈 여백 없이 채우고 핵심 피사체가 설정한 위치를 기준으로 보이게 한다.
3. `굿즈 사러가기` 버튼을 누르면 `/shop`으로 이동한다.
4. 기존 장바구니가 있어도 웰컴 진입이나 시작 버튼 때문에 자동 삭제하지 않는다.
5. 로고를 운영자가 정한 시간 동안 길게 누르면 `/admin/login`으로 이동한다. 짧은 터치로는 관리자 화면이 열리지 않는다.
6. 설정이나 이미지 로드가 실패하면 앱이 깨지지 않고 기본 배경과 기본 문구를 사용한다.
7. 모든 주요 터치 영역은 48×48px 이상이어야 한다.
8. 키보드 Enter/Space와 터치 입력으로 시작 버튼을 사용할 수 있어야 한다.

먼저 실패하는 테스트를 작성하고, 최소 구현으로 통과시켜라. 다음을 반드시 검증한다.

- 설정 기반 배경 스타일
- 기본값 fallback
- `/shop` 이동
- 장바구니 유지
- 관리자 long-press의 성공과 짧은 터치 무시
- 9:16 및 좁은 세로 viewport에서 핵심 버튼 노출

`npm run lint`, `npm run typecheck`, `npm test`를 실행하고 가능하면 해당 화면의 Playwright 스모크 테스트도 실행하라. 디자인 참조 이미지와 비교한 스크린샷을 결과에 포함하라. 작업을 커밋하고 push한 뒤 PR을 준비하되 직접 병합하지 마라.

완료 보고 형식:

```text
브랜치:
최종 커밋:
변경한 파일:
구현한 요구사항:
실행한 검증과 결과:
스크린샷 경로:
남은 위험 또는 다음 스레드 전달사항:
```
