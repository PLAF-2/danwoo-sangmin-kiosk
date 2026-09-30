# Customer Detail Flow Design

## Goal

Keep the customer product detail and payment-processing surfaces readable inside the portrait kiosk frame without page scrolling, and return shoppers to the filtered catalog after adding a product.

## Detail Screen

- Use the existing product, gallery, quantity and cart APIs; no data-model change.
- Display one primary square product image, one-line product title and price, a two-line description, up to two specification rows, and a compact quantity/total/action dock within the viewport.
- Hide gallery thumbnails when there is only one image. A multi-image gallery remains accessible through compact thumbnails.
- `장바구니 담기` adds the selected quantity and navigates to `/shop` with the existing route state, preserving category and catalog scroll position.
- `바로 구매` continues to route to checkout.

## Processing Screen

- Use a white background, fixed typography and centered content.
- Keep the current order creation/timer behavior and error actions unchanged.
- Replace oversized viewport-based type with a compact wordmark, heading, short status text and a small CSS-only loading mark.

## Verification

- Update the detail test to require catalog return after adding and preserve the selected quantity.
- Keep the existing processing behavior tests and run the focused suites plus typecheck/build.
