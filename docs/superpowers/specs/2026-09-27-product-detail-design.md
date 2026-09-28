# Product Detail Design

## Scope

Implement the customer product detail route at `/products/:productId` using the existing `Product` contract, catalog IPC reader, cart store, router, and kiosk media URL helper. Keep changes inside `src/features/product-detail/**` except for the route registration and tests required to expose the page.

## Behavior

- Load the catalog once and resolve the route id to a visible product in an active category.
- Show the thumbnail plus detail images in square frames, with hidden gallery scrollbars and dots indicating the current image.
- Clamp quantity from 1 through `product.maxQuantity`; calculate the selected total immediately.
- Add to cart without navigation and show success feedback. Buy now adds to the existing cart quantity and navigates to `/checkout`.
- Treat missing, hidden, and sold-out products explicitly. Sold-out products cannot be added or purchased.
- Replace failed product images with the existing brand fallback image.
- Preserve the shop category and scroll position through the existing browser history/state contract when returning to `/shop`.

## Testing

Add focused page tests for normal products, missing/hidden/sold-out states, quantity limits, cart merging, buy-now navigation, image fallback, and return-state preservation. Update router tests from the placeholder heading to the real page.

## Deliberate simplification

Keep the page logic in one feature-level page with small local helpers; do not introduce a product repository or new global store for a single consumer.
