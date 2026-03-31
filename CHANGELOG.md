# Changelog

All notable changes to this project are documented in this file.

## [1.0.4] - 2026-03-21

### Added

- Extension popup UI via `action.default_popup` with its own `popup.html`, `popup.css`, and `popup.js`.
- Popup controls for enabling/disabling on-page features and manually refreshing the active supported tab.
- Local comparison list stored in Chrome storage so saved products persist between tabs and sessions.
- Save-to-compare button inside the injected `Для сравнения` block on supported product pages.
- Product-title extraction and save support for `shop.kz`.
- Product-title extraction and save support for `sulpak.kz`.
- Product-title extraction and save support for `ispace.kz`.
- Product-title extraction and save support for `itmag.kz`.
- Store-aware saved product records containing title, store name, product URL, and prices in `KZT`, `USD`, and `RUB`.
- Comparison metadata (`titleKey` / `compareKey`) to preserve a foundation for smarter matching of similar products from different stores.

### Changed

- Expanded extension permissions and match patterns to support popup state, saved comparisons, and additional stores.
- Updated the project description in `manifest.json` to reflect the comparison-list workflow instead of Technodom-only conversion.
- Restyled the injected comparison box with a more prominent card layout and dedicated save button states.
- Changed the injected `Для сравнения` block so product pages no longer repeat the `KZT` line and instead focus on `USD` and `RUB`.
- Unified popup currency conversion by recalculating `USD` and `RUB` from saved `KZT` prices using one shared rate fetch, avoiding mixed-rate comparisons between items saved at different times.
- Switched popup comparison behavior to use the first saved item as the baseline for all later items.
- Added color-coded comparison indicators in popup: red `↑` for higher prices, green `↓` for lower prices, and gray `=` for equal prices.
- Added per-currency comparison rows in popup for `KZT`, `USD`, and `RUB`.
- Added compact numeric deltas next to popup comparison arrows so the difference is visible without opening any extra view.
- Added live exchange-rate details to the popup status text so the active `KZT -> USD/RUB` conversion basis is visible without inspecting the page.
- Improved saved-item hydration in popup so older entries without newer metadata can still render safely.

### Fixed

- Preserved product titles more reliably when saving items from supported stores.
- Reduced false mismatch issues by introducing normalized comparison keys derived from product names and model-like tokens.
- Ensured popup comparisons remain internally consistent even when saved items were added under different exchange-rate snapshots.
- Fixed KZT parsing for stores that show decimal-formatted prices such as `628 253,00`, preventing inflated saved values on `itmag.kz`.
- Enabled smart matching to actively choose the closest previously saved product as the popup comparison base instead of only storing matching metadata for future use.
- Stopped Technodom comparison blocks from briefly reappearing after disabling conversion in popup by cancelling pending timers and disconnecting DOM observation immediately.
- Eliminated Technodom product-page flicker for the newer comparison block by isolating the current injected UI on a separate `td-converter-box-v2` class and treating legacy `.td-converter-box` nodes as stale blocks to hide and remove.

## [1.0.3] - 2026-03-19

### Fixed

- Added conversion support for alternative `.product__price-container` / `.product__current-price` markup on both product pages and repeated catalog cards.

## [1.0.2] - 2026-03-19

### Fixed

- Restored price conversion on initial page open by reattaching DOM observation after page hydration and in-site navigation.
- Added support for both `technodom.kz` and `www.technodom.kz` URLs in the extension match patterns.

## [1.0.1] - 2026-03-03

### Added

- `README.md` with installation and Chrome loading instructions.

### Changed

- Improved price selector strategy using `data-testid="product-price"` with class-based fallbacks.
- Added safe exchange-rate fetch handling with timeout and cached fallback on failures.
- Optimized `MutationObserver` scope and trigger conditions to reduce unnecessary rescans.
- Refreshed already-converted prices when cached exchange rates rotate (TTL boundary).
- Bumped extension version in `manifest.json` to `1.0.1`.

## [1.0.0] - 2026-01-16

### Added

- Initial Chrome extension implementation for converting `KZT` prices on `technodom.kz` to `USD` and `RUB`.
