# Welcome & Shell Design

## Scope

Implement only the customer welcome route. It consumes the existing `window.kiosk.settings.read` contract and leaves the router, preload API, shared settings types, and cart store untouched.

## Behaviour

- The route reads settings on mount. While loading or after an error, it renders the same safe defaults: the bundled welcome image, centred focus, scale `1`, visible logo, and `새로운 수평선을 만나보세요.`.
- A full-viewport 9:16-safe shell uses `background-size: cover`; image position and scale come from the persisted settings.
- `굿즈 사러가기` is a native button that navigates to `/shop`, so keyboard Enter/Space and touch work without custom handlers.
- The logo measures a pointer hold using one timeout. Only a completed hold navigates to `/admin/login`; pointer release/cancel clears it. No cart action is dispatched.
- Layout keeps the CTA visible in short portrait viewports and relies on the existing 48px touch-target token.

## Tests

React Testing Library verifies configured styling, failed settings fallback, `/shop` navigation, preserved cart state, long-press versus short press, keyboard activation, and CTA visibility in 9:16 and short portrait viewports. A focused Playwright smoke test will cover the rendered route if the Electron runtime supports it.
