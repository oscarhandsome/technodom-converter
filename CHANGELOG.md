# Changelog

All notable changes to this project are documented in this file.

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
