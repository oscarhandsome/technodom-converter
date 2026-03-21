# Technodom Price Converter

Browser extension (Manifest V3) for `technodom.kz` that converts product prices from KZT to USD and RUB using live exchange rates.

## What it does

- Detects prices on product pages and catalog cards.
- Fetches KZT exchange rates from `https://open.er-api.com/v6/latest/KZT`.
- Shows converted prices in USD and RUB directly on the page.
- Shows the original KZT price together with USD and RUB in the injected block.
- Adds a button near the price block to save the current product into a comparison list.
- Caches rates for 1 hour to reduce API calls.
- Adds a popup menu from the extension icon where you can enable/disable conversion, refresh the current tab, and view saved comparison items.

## Project files

- `manifest.json` - extension manifest and permissions.
- `content.js` - main conversion logic, save-to-compare button, and local comparison storage updates.
- `styles.css` - styles for injected conversion boxes.
- `popup.html`, `popup.css`, `popup.js` - popup menu shown when clicking the extension icon.

## Installation

No build step is required.

1. Clone or download this repository.
2. Keep all files in one folder (including `manifest.json`, `content.js`, `styles.css`, and icons).

## How to load extension in Chrome

1. Open Chrome and go to `chrome://extensions/`.
2. Enable `Developer mode` (top-right toggle).
3. Click `Load unpacked`.
4. Select this project folder: `technodom-converter`.
5. Open `https://www.technodom.kz/` and verify converted prices appear on product and catalog pages.
6. Click the extension icon to the right of the address bar to open the popup menu.
