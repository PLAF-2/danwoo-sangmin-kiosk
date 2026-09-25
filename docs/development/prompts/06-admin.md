# Thread 06 — Admin

아래 내용을 새 개발 스레드의 첫 메시지로 그대로 사용한다.

---

당신은 HIGHEST 굿즈 키오스크의 로컬 관리자 화면 스레드를 담당한다.

저장소는 `https://github.com/PLAF-2/danwoo-sangmin-kiosk.git`이다. Foundation PR이 `main`에 병합된 뒤 최신 `main`에서 `codex/admin` 브랜치를 만들어라.

작업 전에 아래 자료를 전부 읽어라.

- `HIGHEST_HORIZON_CONCEPT.md`
- `docs/superpowers/specs/2026-09-26-highest-kiosk-functional-design.md`
- `docs/superpowers/plans/2026-09-26-kiosk-threaded-development.md`
- `docs/development/THREAD_EXECUTION_GUIDE.md`
- 고객 화면 참조 이미지 전체

주 소유 범위는 `src/features/admin/**`, `electron/ipc/adminIpc.ts`, `electron/ipc/backupIpc.ts`다. 고객 화면 디자인을 재구성하지 말고, 관리자가 고객 화면의 콘텐츠를 안전하게 편집하도록 구현한다.

필수 구현:

1. `/admin/login` 비밀번호 인증과 관리자 전용 route guard를 구현한다.
2. 비밀번호는 main process에서 해시된 값으로 검증하며 renderer나 저장 JSON에 평문으로 두지 않는다.
3. 관리자 입력이 5분간 없으면 로그아웃하고 로그인 화면으로 이동한다.
4. 상품 관리에서 추가, 수정, 복제, 숨김, 품절, 표시 순서, 최대 수량을 편집한다.
5. 상품 대표·상세 이미지는 저장 전 1:1 자르기 미리보기를 거친다. 실제 파일은 관리용 데이터 폴더로 복사하고 경로만 상품 데이터에 저장한다.
6. 카테고리 추가, 이름, 노출, 순서를 편집한다. 시스템 `전체`는 삭제하거나 이름을 바꿀 수 없다.
7. 웰컴 배경 업로드, 위치, 확대 배율, 로고와 문구를 실제 9:16 미리보기로 조정한다.
8. 결제 모드 instant, bankQr, simulation과 모드별 필드를 편집한다. bankQr의 계좌·예금주·QR, 처리 시간, 성공·실패 시뮬레이션과 수령 안내를 포함한다.
9. 현재 비밀번호 확인 후 새 관리자 비밀번호를 설정한다.
10. 카탈로그·설정·미디어를 하나의 백업으로 내보내고 가져온다. 가져오기 전 schema와 파일 존재 여부를 검증하며 실패하면 기존 데이터를 전혀 변경하지 않는다.
11. 저장 완료 후 고객 화면을 다시 열면 재빌드 없이 새 데이터가 보이게 한다.

관리자 UI도 HIGHEST의 하늘·별·블루 계열을 사용하되 고객 화면보다 정보 밀도와 편집 명확성을 우선한다. 삭제성 동작은 확인을 거치고 성공·실패 결과를 명확히 표시한다.

테스트를 먼저 작성하고 인증 성공·실패, route guard, 5분 로그아웃, 상품·카테고리 CRUD, 이미지 비율 검증, 웰컴 미리보기, 세 결제 모드, 비밀번호 변경, 백업 성공·실패 원자성을 검증하라.

`npm run lint`, `npm run typecheck`, `npm test`를 실행하고 주요 관리자 화면 스크린샷을 남겨라. 커밋과 push 후 PR을 준비하되 직접 병합하지 마라. 테스트용 실제 비밀번호나 계좌번호를 커밋하지 마라.
