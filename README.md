# HIGHEST Kiosk

HIGHEST 굿즈 판매용 Electron 키오스크의 공통 기반입니다. 현재 저장소에는 안전한 로컬 저장소, typed IPC, 장바구니·세션 상태, 라우팅, 테스트 기반이 구현되어 있습니다. 고객·관리자 화면은 후속 개발 스레드가 구현하며, 현재 라우트는 의도적으로 placeholder를 표시합니다.

## 개발 환경

- Node.js: `^20.19.0` 또는 `>=22.12.0` (`package.json`의 `engines` 기준)
- npm: `11.9.0` (`packageManager` 기준)
- 권장 환경: Node.js 22.12 이상, npm 11.9.0

의존성을 설치하고 개발 앱을 실행합니다.

```bash
npm install
npm start
```

개발 실행은 720×1280(9:16) 창으로 열리지만 kiosk 모드는 사용하지 않습니다. 패키징된 앱은 `kiosk: true`로 전체 화면 실행되며 창 메뉴를 숨깁니다. 앱이 모니터 회전이나 해상도를 바꾸지는 않으므로 운영 장비의 디스플레이를 세로 방향(권장 1080×1920)으로 먼저 설정해야 합니다.

개발 앱과 패키징 앱은 운영체제가 정한 같은 `userData` 위치를 기본으로 사용할 수 있습니다. 실제 운영 데이터를 보호해야 한다면 별도 OS 사용자 또는 격리된 테스트 장비에서 개발 빌드를 실행하십시오.

## 명령

| 명령 | 동작 |
|---|---|
| `npm start` | Electron Forge/Vite 개발 서버와 Electron 앱 실행 |
| `npm run lint` | 전체 저장소 ESLint 검사 |
| `npm run typecheck` | main, renderer, unit test, E2E TypeScript 설정을 차례로 검사 |
| `npm test` | Vitest 단위·컴포넌트 테스트를 1회 실행 |
| `npm run test:e2e` | 먼저 `electron-forge package`로 현재 OS/CPU용 앱을 `out/`에 패키징한 뒤 Playwright 테스트 전체 실행 |
| `npm run make` | Electron Forge maker로 현재 OS/CPU용 배포 산출물 생성 |

`npm run test:e2e`는 renderer를 Vite 서버에서 확인하고, 개발 Electron의 preload 경계를 확인하고, 새 임시 사용자 데이터 폴더로 패키징 앱이 부팅되어 기본 데이터와 미디어를 설치하는지 확인합니다. 브라우저 실행 파일이 없다는 오류가 나면 한 번 `npx playwright install chromium`을 실행하십시오.

`electron-forge package` 단계만 따로 실행하려면 다음 명령을 사용합니다.

```bash
npm exec electron-forge package
```

이 명령은 설치 프로그램이나 ZIP을 만들지 않고 실행 가능한 앱 디렉터리만 생성합니다.

## Windows 패키징

Windows x64에서 현재 설정의 출력 위치는 다음과 같습니다.

- package 디렉터리: `out/HIGHEST Kiosk-win32-x64/`
- 실행 파일: `out/HIGHEST Kiosk-win32-x64/HIGHEST Kiosk.exe`
- `npm run make` ZIP: `out/make/zip/win32/x64/HIGHEST Kiosk-win32-x64-0.1.0.zip`

버전, 운영체제 또는 CPU 아키텍처가 바뀌면 경로의 `0.1.0`, `win32`, `x64` 부분도 바뀝니다. 현재 Forge 설정의 Windows maker는 ZIP이며 설치 프로그램을 만들지 않습니다. 산출물은 코드 서명되지 않은 개발·검증용 빌드입니다.

ZIP을 대상 장비에 풀고 `HIGHEST Kiosk.exe`를 실행합니다. 단일 인스턴스 잠금을 사용하므로 두 번째 실행 요청은 새 창을 만들지 않고 기존 창을 복원해 포커스합니다.

## 로컬 데이터

Electron의 `app.getPath('userData')` 아래에 데이터를 저장합니다. 기본 위치는 다음과 같습니다.

| 운영체제 | 기본 위치 |
|---|---|
| Windows | `%APPDATA%\HIGHEST Kiosk` |
| macOS | `~/Library/Application Support/HIGHEST Kiosk` |
| Linux | `$XDG_CONFIG_HOME/HIGHEST Kiosk` 또는 `~/.config/HIGHEST Kiosk` |

실제 위치는 OS 설정, `XDG_CONFIG_HOME`, Electron 실행 인수 등에 따라 달라질 수 있습니다. 데이터 레이아웃은 다음과 같습니다.

```text
<userData>/
├─ catalog.json
├─ settings.json
├─ payment.json
├─ admin-credentials.json             # 초기 비밀번호 설정 후 생성되는 scrypt salt/hash
├─ images/
│  ├─ welcome-background.svg
│  ├─ horizon-album.svg
│  ├─ horizon-album-detail.svg
│  ├─ horizon-keyring.svg
│  └─ <관리자가 가져온 UUID 이름의 jpeg|jpg|png|webp>
├─ orders/
│  ├─ <orderNumber>.json
│  └─ .requests/
│     └─ <requestId>.json             # 중복 주문 요청 방지 기록
└─ .highest-restore-<임의 문자열>/    # 백업 복원 중에만 존재
   ├─ restore-manifest.json            # version 1, prepared 또는 committed
   ├─ stage/
   │  ├─ catalog.json
   │  ├─ settings.json
   │  ├─ payment.json
   │  └─ images/
   └─ rollback/
      ├─ catalog.json                  # 복원 전 실제 파일이 있었을 때만
      ├─ settings.json                 # 복원 전 실제 파일이 있었을 때만
      ├─ payment.json                  # 복원 전 실제 파일이 있었을 때만
      └─ images/                       # 복원 전 디렉터리가 있었을 때만
```

복원은 먼저 `stage/`에 네 대상을 만들고 `prepared` manifest를 기록한 다음, 기존 대상이 있으면 `rollback/`으로 옮기고 stage를 게시합니다. 정상 완료 후 `committed` manifest와 stage/rollback/journal은 정리됩니다. 비정상 종료로 저널이 남으면 다음 시작 시 `prepared`는 rollback하고 `committed`는 정리합니다. 원래 없던 대상은 rollback에 생성되지 않습니다.

JSON 저장은 같은 디렉터리에 `.<파일명>.<UUID>.tmp` 임시 파일을 기록·동기화한 뒤 rename하여 교체합니다. 정상 완료된 임시 파일은 정리됩니다.

### 기본값 설치 규칙

첫 실행 시 `data/defaults/catalog.json`, `settings.json`, `payment.json`과 `data/defaults/images/`의 샘플 이미지를 검증한 뒤 `userData`로 복사합니다. “첫 실행”은 전체 폴더를 매번 덮어쓴다는 뜻이 아닙니다. 각 JSON과 이미지 파일을 개별적으로 확인해 없는 파일만 원자적으로 설치하며 기존 파일은 보존합니다. 따라서 앱 업데이트만으로 운영자가 수정한 데이터가 초기값으로 되돌아가지 않습니다.

## 관리자 초기 비밀번호

초기 비밀번호는 8자 이상 128자 이하입니다. 문자 종류 조합 규칙은 없습니다. 앱은 비밀번호 원문을 파일에 저장하지 않고 무작위 salt와 scrypt hash만 `admin-credentials.json`에 저장합니다.

아래 예시는 비밀번호를 명령줄 인수, 소스, 설정 파일 또는 셸 기록에 직접 적지 않습니다. 입력값은 해당 실행 프로세스와 자식 프로세스의 환경에만 일시적으로 전달됩니다. 첫 실행 명령인 `npm start` 대신 패키징된 `HIGHEST Kiosk.exe`를 같은 방식으로 실행해도 됩니다.

PowerShell:

```powershell
$secure = Read-Host '초기 관리자 비밀번호' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $env:KIOSK_ADMIN_INITIAL_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  npm.cmd start
} finally {
  Remove-Item Env:KIOSK_ADMIN_INITIAL_PASSWORD -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}
```

명령 프롬프트(`cmd.exe`)에서는 PowerShell의 숨김 입력을 이용해 자식 프로세스를 실행합니다.

```bat
powershell -NoProfile -Command "$s=Read-Host '초기 관리자 비밀번호' -AsSecureString; $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try {$env:KIOSK_ADMIN_INITIAL_PASSWORD=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($p); npm.cmd start} finally {Remove-Item Env:KIOSK_ADMIN_INITIAL_PASSWORD -ErrorAction SilentlyContinue; [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)}"
```

Bash:

```bash
read -rsp 'Initial admin password: ' kiosk_password && printf '\n'
KIOSK_ADMIN_INITIAL_PASSWORD="$kiosk_password" npm start
unset kiosk_password
```

`admin-credentials.json`이 이미 있으면 환경 변수는 무시되어 기존 비밀번호가 유지됩니다. 자격 증명 파일이 없고 환경 변수도 없으면 앱은 시작되지만 관리자 인증은 비활성화되고 오류 로그가 남습니다. 이 경우 환경 변수를 제공해 앱을 다시 시작하면 자격 증명 파일을 생성할 수 있습니다.

비밀번호 변경 IPC는 이미 `window.kiosk.admin.changePassword(currentPassword, nextPassword)`로 제공됩니다. 실제 변경 화면은 Admin 스레드가 `/admin/system`에 구현할 예정이며, 변경이 성공하면 모든 기존 관리자 세션이 무효화됩니다. 관리자 화면을 닫을 때는 `window.kiosk.admin.logout()`을 호출합니다. 이 호출은 해당 renderer sender의 세션만 즉시 폐기합니다. 보호된 IPC 사용 시 갱신되는 5분 유휴 만료의 화면 연동(경고와 로그인 화면 전환)은 Admin 스레드가 담당합니다.

## 보안 경계

- renderer는 `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`로 실행됩니다.
- preload는 renderer에 `window.kiosk`만 공개합니다. Node.js의 `process`와 `require`는 노출하지 않습니다.
- IPC는 main frame과 신뢰된 renderer URL을 확인하며, 관리자 변경 작업은 인증된 5분 유휴 세션을 요구합니다.
- 새 창 열기와 외부 navigation을 차단합니다.
- 사용자 이미지에는 `kiosk-media://images/<상대 경로>` 전용 scheme을 사용합니다. scheme은 `userData/images` 내부의 허용된 이미지 확장자만 제공하고 절대 경로, 상위 경로 이동, symlink를 거부합니다.
- 앱은 단일 인스턴스로 동작합니다.

### Renderer IPC 계약

- 정사각형 상품/QR 이미지는 `window.kiosk.media.selectImage('square')`로 선택합니다. 반환값은 요청 `kind`, 최대 512 KiB의 PNG data URL 미리보기, 원본 픽셀 크기, opaque `selectionId`만 포함하며 로컬 파일 경로는 포함하지 않습니다. 사용자가 정사각형 영역을 결정한 뒤 `window.kiosk.media.saveSquareCrop({ selectionId, x, y, width, height })`를 호출하면 main process가 범위와 관리자 세션을 다시 확인하고 PNG로 crop해 저장합니다. 선택은 한 번만 사용할 수 있고 5분 뒤 만료되며 프로세스 내 보관 개수도 최대 8개입니다.
- 기존 `importSquareImage()`와 `importWelcomeImage()`는 호환성을 위해 유지됩니다. 전자는 이미 정사각형인 파일만 직접 저장하며, 후자는 welcome 배경을 직접 가져옵니다.
- `window.kiosk.admin.logout()`은 호출 sender의 관리자 세션만 폐기합니다.
- `window.kiosk.orders.create(input)`은 결제 화면의 대기 애니메이션과 simulation 판단이 끝난 뒤 한 번 호출합니다. 저장 상태는 항상 terminal입니다: `instant → paid`, `bankQr → received`, `simulation success → paid`, `simulation failure → failed`. `processingSeconds`와 `simulationResult`는 호출 전 표시/제어용 설정입니다. 같은 `requestId` 재호출은 디스크 재시작 이후에도 같은 주문을 반환하며, 실패 후 새 시도를 생성하려면 새 `requestId`를 사용해야 합니다.

이 경계는 같은 OS 사용자 계정이 악의적으로 로컬 파일이나 디렉터리 junction을 동시에 바꾸는 공격까지 방어하는 시스템 권한 경계는 아닙니다. 운영 장비는 제한된 전용 OS 계정으로 실행하고 `userData` 접근 권한을 제한해야 합니다.

## 백업과 복원

관리자 백업 JSON에는 다음 항목만 포함됩니다.

- `version: 1`
- `catalog` (`catalog.json`)
- `settings` (`settings.json`)
- `payment` (`payment.json`)
- `images` (`images/`의 검증된 파일을 Base64로 포함)

주문(`orders/` 및 `.requests/`), 관리자 자격 증명(`admin-credentials.json`), 임시 파일, 복원 저널은 제외됩니다. 즉 백업 복원은 판매 콘텐츠와 표시·결제 설정만 교체하며 주문 이력과 관리자 비밀번호를 이전하거나 되돌리지 않습니다. 가져오기는 schema, 경로, 이미지 형식·크기·개수를 먼저 모두 검증하고 가져올 상품·카테고리·이미지 수와 교체 범위를 확인 dialog로 표시합니다. 관리자가 승인한 뒤에만 stage/rollback 저널을 이용해 네 대상(`catalog`, `settings`, `payment`, `images`)을 함께 교체합니다.

## 현재 라우트와 후속 소유권

현재 모든 화면은 기반 연결을 검증하는 placeholder입니다. 최종 UI는 이 Foundation 범위에 포함되지 않습니다.

| 경로 | 상태 | 후속 소유 스레드 |
|---|---|---|
| `/` | placeholder | Welcome & Shell (`codex/welcome-shell`) |
| `/shop` | placeholder | Catalog & Cart (`codex/catalog-cart`) |
| `/products/:productId` | 동적 ID placeholder | Product Detail (`codex/product-detail`) |
| `/checkout`, `/processing` | placeholder | Checkout & Payment (`codex/checkout-payment`) |
| `/complete/:orderNumber` | 동적 주문번호 placeholder | Completion & Session (`codex/completion-session`) |
| `/admin/login`, `/admin/products`, `/admin/categories`, `/admin/welcome`, `/admin/payment`, `/admin/system` | placeholder | Admin (`codex/admin`) |
| 그 외 | 404 placeholder와 시작 링크 | Foundation 공통 router |

상세 순서와 파일 소유권은 [`docs/development/THREAD_EXECUTION_GUIDE.md`](docs/development/THREAD_EXECUTION_GUIDE.md)를 참고하십시오.

## Sharp와 native 패키지

이미지 검증은 native 모듈인 Sharp를 사용합니다. Forge는 Sharp와 런타임 의존성을 패키지에 포함하고 native 바이너리를 ASAR 밖으로 자동 unpack하도록 설정되어 있습니다. 다른 OS나 CPU용 `node_modules`를 복사하지 말고 대상 빌드 환경에서 `npm install` 후 패키징하십시오. native module/ABI 또는 `@img/sharp-*` 오류가 나면 지원 Node.js 버전을 확인한 뒤 현재 환경에서 의존성을 다시 설치하고 패키징하십시오.

## 문제 해결

- `npm` 명령을 PowerShell에서 찾거나 실행하지 못하면 Node.js 설치와 PATH를 확인하고 `npm.cmd`를 사용합니다.
- Node/npm 버전 경고가 나면 `node --version`, `npm --version`이 위 요구사항과 맞는지 확인합니다.
- Playwright가 브라우저 실행 파일을 찾지 못하면 `npx playwright install chromium`을 실행합니다.
- 앱 시작 시 기본 데이터 오류가 나면 `data/defaults`의 JSON schema와 참조 이미지 존재 여부를 확인합니다. 기존 운영 데이터는 먼저 별도 백업한 뒤 다루십시오.
- 관리자 로그인이 항상 실패하면 시작 로그의 “Admin authentication is disabled” 메시지와 `admin-credentials.json` 존재 여부를 확인하고, 파일이 없다면 환경 변수를 제공해 다시 시작합니다.
- 이미지가 보이지 않으면 JSON 경로가 `images/...` 상대 경로인지, 실제 파일이 `<userData>/images/` 아래에 있는지 확인합니다.
- 패키징 결과가 예상과 다르면 오래된 `out/` 산출물과 현재 `forge.config.ts`를 혼동하지 않았는지 확인합니다. 현재 Windows 설정은 ZIP maker만 활성화합니다.

프로젝트 기능 기준은 [`docs/superpowers/specs/2026-09-26-highest-kiosk-functional-design.md`](docs/superpowers/specs/2026-09-26-highest-kiosk-functional-design.md), 개발 계획은 [`docs/superpowers/plans/2026-09-26-kiosk-threaded-development.md`](docs/superpowers/plans/2026-09-26-kiosk-threaded-development.md)에 있습니다.
