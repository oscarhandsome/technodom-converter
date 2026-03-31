let debounceTimer = null;
let cachedRates = null;
let cachedAt = 0;
let observer = null;
let observedRoot = null;
let reattachObserverTimer = null;
let lastKnownUrl = window.location.href;
let navigationBurstTimerIds = [];
let urlPollTimer = null;
let converterEnabled = true;
let technodomProductPageLateRenderTimer = null;

const CACHE_TTL = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 7000;
const OBSERVER_REATTACH_DELAY_MS = 1000;
const NAVIGATION_BURST_DELAYS_MS = [0, 400, 1200, 2500, 4000];
const URL_POLL_INTERVAL_MS = 500;
const TECHNODOM_PRODUCT_PAGE_LATE_RENDER_MS = 4500;
const BOX_RENDER_VERSION = "2";
const BOX_CLASS = "td-converter-box-v2";
const LEGACY_BOX_CLASS = "td-converter-box";
const ANY_BOX_SELECTOR = `.${BOX_CLASS}, .${LEGACY_BOX_CLASS}`;
const INSTANCE_ID = `td-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const SAVED_PRODUCTS_KEY = "savedProducts";
const PRODUCT_CARD_CLASS_HINT = '[class*="ProductCard"]';
const TECHNODOM_CATALOG_CARD_SELECTOR =
  ".products__item, article.product, .category-product, .product-list__item";
const ALTERNATIVE_CARD_CONTAINER_SELECTOR = ".product__price-container";
const ALTERNATIVE_CARD_PRICE_SELECTOR = ".product__current-price";
const TECHNODOM_HOST_RE = /(^|\.)technodom\.kz$/i;
const SHOP_HOST_RE = /(^|\.)shop\.kz$/i;
const SULPAK_HOST_RE = /(^|\.)sulpak\.kz$/i;
const ISPACE_HOST_RE = /(^|\.)ispace\.kz$/i;
const ITMAG_HOST_RE = /(^|\.)itmag\.kz$/i;
const PRICE_NODE_SELECTOR = [
  'p[data-testid="product-price"]',
  ".ProductCardPrices_pricesInfo__b58jF",
  ".ProductPricesVariantB_block__hevXI",
  ".product__price-container",
  ".product__current-price",
  ".item_current_price",
  ".product__price",
  ".product-price_price-value",
  ".price",
].join(", ");
const TECHNODOM_PRODUCT_TITLE_SELECTORS = [
  'h1[data-testid="product-title"]',
  'h1[class*="Typography"]',
  ".product__title",
  'meta[property="og:title"]',
];
const TECHNODOM_CARD_TITLE_SELECTORS = [
  '[data-testid="product-title"]',
  '[class*="ProductCard"] a[title]',
  '[class*="ProductCard"] h2',
  '[class*="ProductCard"] h3',
  "h2",
  "h3",
  "h4",
  "a[title]",
];
const SHOP_PRODUCT_TITLE_SELECTORS = [
  "#pagetitle",
  "h1.bx-title",
  'meta[property="og:title"]',
];
const SHOP_PRODUCT_PRICE_SELECTORS = [
  ".item_current_price",
  '[id$="_price"]',
];
const SULPAK_PRODUCT_TITLE_SELECTORS = [
  "h1.title__xmedium",
  'meta[property="og:title"]',
];
const SULPAK_PRODUCT_PRICE_SELECTORS = [".product__price"];
const ISPACE_PRODUCT_TITLE_SELECTORS = [
  "h1.product-page_name",
  'meta[property="og:title"]',
];
const ISPACE_PRODUCT_PRICE_SELECTORS = [".product-price_price-value"];
const ITMAG_PRODUCT_TITLE_SELECTORS = [
  "h1.title_section",
  'meta[property="og:title"]',
];
const ITMAG_PRODUCT_PRICE_SELECTORS = [".price", '[id$="_price"]'];

function ensureConverterVisibilityStyle() {
  const styleId = "td-converter-visibility-style";
  let styleEl = document.getElementById(styleId);

  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = styleId;
    document.documentElement.append(styleEl);
  }

  styleEl.textContent = `
    html[data-td-converter-enabled="false"] ${ANY_BOX_SELECTOR} {
      display: none !important;
    }

    .${LEGACY_BOX_CLASS} {
      display: none !important;
    }

    .${BOX_CLASS}:not([data-render-version="${BOX_RENDER_VERSION}"]) {
      display: none !important;
    }
  `;
}

function syncConverterVisibility() {
  document.documentElement.dataset.tdConverterEnabled = converterEnabled
    ? "true"
    : "false";
}

function isTechnodom() {
  return TECHNODOM_HOST_RE.test(window.location.hostname);
}

function isShopKz() {
  return SHOP_HOST_RE.test(window.location.hostname);
}

function isSulpak() {
  return SULPAK_HOST_RE.test(window.location.hostname);
}

function isISpace() {
  return ISPACE_HOST_RE.test(window.location.hostname);
}

function isItmag() {
  return ITMAG_HOST_RE.test(window.location.hostname);
}

function getStoreName() {
  if (isShopKz()) return "Shop.kz";
  if (isSulpak()) return "Sulpak";
  if (isISpace()) return "iSpace";
  if (isItmag()) return "ITMag";
  return "Technodom";
}

function parseKztPrice(priceText) {
  const normalized = String(priceText || "")
    .replace(/\s+/g, "")
    .replace(/[^\d,.-]/g, "");

  if (!normalized) return 0;

  const decimalMatch = normalized.match(/([.,])(\d{2})$/);
  const integerPart = decimalMatch
    ? normalized.slice(0, decimalMatch.index)
    : normalized;

  return Number(integerPart.replace(/[^\d-]/g, ""));
}

function formatPrice(value) {
  return Number(value || 0)
    .toLocaleString("ru-RU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    .replace(/\s/g, "&nbsp;");
}

function sanitizeText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function normalizeTitle(title) {
  return sanitizeText(title).toLocaleLowerCase("ru-RU");
}

function normalizeColor(title) {
  const normalized = normalizeTitle(title);
  const colorMap = [
    ["starlight", "starlight"],
    ["серый космос", "spacegray"],
    ["space gray", "spacegray"],
    ["spacegrey", "spacegray"],
    ["midnight", "midnight"],
    ["темная ночь", "midnight"],
    ["тёмная ночь", "midnight"],
    ["sky blue", "skyblue"],
    ["небесно-голубой", "skyblue"],
    ["silver", "silver"],
  ];

  for (const [needle, value] of colorMap) {
    if (normalized.includes(needle)) return value;
  }

  return "";
}

function buildComparisonKey(title) {
  const normalized = normalizeTitle(title)
    .replace(/[\(\)\[\],.:;|/\\]+/g, " ")
    .replace(/\b(sn|s\/n|серия|модель|model)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const codeMatches = normalized.match(/[a-z0-9]{4,}/gi) || [];
  const priorityCodes = codeMatches.filter((token) => /\d/.test(token));

  if (priorityCodes.length) {
    return priorityCodes.slice(0, 4).join("|");
  }

  return normalized;
}

function extractMatch(title, regex) {
  return normalizeTitle(title).match(regex)?.[1] || "";
}

function buildMatchProfile(title) {
  const normalized = normalizeTitle(title);
  const skuMatches = Array.from(
    new Set(
      (normalized.match(/[a-z]{1,5}\d[a-z0-9/-]{2,}/gi) || []).map((value) =>
        value.replace(/\//g, "")
      )
    )
  );

  const modelMatches = Array.from(
    new Set(normalized.match(/\ba\d{4}\b/gi) || [])
  );

  return {
    family: normalized.includes("macbook air") ? "macbook air" : "",
    chip: extractMatch(normalized, /\b(m1|m2|m3|m4)\b/i),
    ram: extractMatch(normalized, /\b(8|16|24|32|36)\s*(?:gb|гб)\b/i),
    storage: extractMatch(normalized, /\b(128|256|512|1024|1)\s*(?:ssd|gb|гб|tb|тб)\b/i),
    size:
      extractMatch(normalized, /\b(13(?:[.,]\d)?|15(?:[.,]\d)?)[" ]/i) ||
      extractMatch(normalized, /\b(13(?:[.,]\d)?|15(?:[.,]\d)?)\b/i),
    color: normalizeColor(normalized),
    skuMatches,
    modelMatches,
  };
}

function getTextFromSelectors(root, selectors) {
  for (const selector of selectors) {
    const node = root.querySelector(selector);
    if (!node) continue;

    const value =
      node.tagName === "META"
        ? node.getAttribute("content")
        : node.textContent || node.getAttribute("title");
    const text = sanitizeText(value);
    if (text) return text;
  }

  return "";
}

function cleanupConvertedPrices() {
  document.querySelectorAll(ANY_BOX_SELECTOR).forEach((node) => node.remove());
  document
    .querySelectorAll("[data-converted-key], [data-last-conversion-key]")
    .forEach((node) => {
      delete node.dataset.convertedKey;
      delete node.dataset.lastConversionKey;
    });
}

function isExpectedConverterBox(box) {
  if (!box?.classList?.contains(BOX_CLASS)) return false;

  return (
    box.dataset.renderVersion === BOX_RENDER_VERSION &&
    box.dataset.ownerId === INSTANCE_ID &&
    Boolean(box.querySelector(".td-converter-box__label")) &&
    Boolean(box.querySelector(".td-save-product-button")) &&
    Boolean(box.querySelector(".td-converter-box__status"))
  );
}

function cleanupUnexpectedConverterBoxes(scope = document) {
  const root = scope instanceof Element || scope instanceof Document ? scope : document;
  root.querySelectorAll(ANY_BOX_SELECTOR).forEach((box) => {
    if (!isExpectedConverterBox(box)) {
      box.remove();
    }
  });
}

function findCardContainer(node) {
  return (
    node.closest(TECHNODOM_CATALOG_CARD_SELECTOR) ||
    node.closest('[class*="ProductCard"]') ||
    node.closest("article") ||
    node.closest("li") ||
    node.parentElement
  );
}

function getSavedProducts() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [SAVED_PRODUCTS_KEY]: [] }, (result) => {
      resolve(Array.isArray(result[SAVED_PRODUCTS_KEY]) ? result[SAVED_PRODUCTS_KEY] : []);
    });
  });
}

function setSavedProducts(items) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [SAVED_PRODUCTS_KEY]: items }, resolve);
  });
}

async function saveProductForComparison(product) {
  const cleanTitle = sanitizeText(product.title) || "Товар без названия";
  const items = await getSavedProducts();
  const nextItem = {
    id: product.id,
    title: cleanTitle,
    titleKey: normalizeTitle(cleanTitle),
    compareKey: buildComparisonKey(cleanTitle),
    profile: buildMatchProfile(cleanTitle),
    store: getStoreName(),
    productUrl: product.productUrl,
    prices: product.prices,
    savedAt: new Date().toISOString(),
  };

  const existingIndex = items.findIndex(
    (item) => item.store === nextItem.store && item.productUrl === nextItem.productUrl
  );

  if (existingIndex >= 0) {
    items[existingIndex] = nextItem;
  } else {
    items.push(nextItem);
  }

  await setSavedProducts(items);
}

function isInsideTechnodomCatalogCard(node) {
  return Boolean(node?.closest?.(TECHNODOM_CATALOG_CARD_SELECTOR));
}

function getTechnodomProductPageTarget() {
  const productPriceCandidates = Array.from(
    document.querySelectorAll('p[data-testid="product-price"]')
  ).filter(
    (node) =>
      !node.closest(PRODUCT_CARD_CLASS_HINT) &&
      !isInsideTechnodomCatalogCard(node)
  );

  if (productPriceCandidates[0]) {
    const priceEl = productPriceCandidates[0];
    const priceBlock =
      priceEl.closest(".ProductPricesVariantB_block__hevXI") ||
      priceEl.parentElement;
    return {
      priceEl,
      priceBlock,
      renderAnchor: priceBlock,
    };
  }

  const alternativePriceEl = Array.from(
    document.querySelectorAll(
      `${ALTERNATIVE_CARD_CONTAINER_SELECTOR} ${ALTERNATIVE_CARD_PRICE_SELECTOR}`
    )
  ).find((node) => {
    const container = node.closest(ALTERNATIVE_CARD_CONTAINER_SELECTOR);
    return (
      !container?.closest(PRODUCT_CARD_CLASS_HINT) &&
      !isInsideTechnodomCatalogCard(container)
    );
  });

  if (alternativePriceEl) {
    const priceBlock =
      alternativePriceEl.closest(ALTERNATIVE_CARD_CONTAINER_SELECTOR) ||
      alternativePriceEl.parentElement;
    return {
      priceEl: alternativePriceEl,
      priceBlock,
      renderAnchor: priceBlock,
    };
  }

  const fallbackPriceEl = document.querySelector(
    ".ProductPricesVariantB_block__hevXI p.Typography.Typography__Heading.Typography__Heading_H1"
  );

  const priceBlock =
    fallbackPriceEl?.closest(".ProductPricesVariantB_block__hevXI") ||
    fallbackPriceEl?.parentElement;

  return {
    priceEl: fallbackPriceEl,
    priceBlock,
    renderAnchor: priceBlock,
  };
}

function getSimpleProductPageTarget(selectors) {
  const priceEl = selectors.map((selector) => document.querySelector(selector)).find(Boolean);
  const priceBlock = priceEl?.parentElement || priceEl;

  return {
    priceEl,
    priceBlock,
    renderAnchor: priceBlock,
  };
}

function getProductPageTarget() {
  if (isShopKz()) return getSimpleProductPageTarget(SHOP_PRODUCT_PRICE_SELECTORS);
  if (isSulpak()) return getSimpleProductPageTarget(SULPAK_PRODUCT_PRICE_SELECTORS);
  if (isISpace()) return getSimpleProductPageTarget(ISPACE_PRODUCT_PRICE_SELECTORS);
  if (isItmag()) return getSimpleProductPageTarget(ITMAG_PRODUCT_PRICE_SELECTORS);
  return getTechnodomProductPageTarget();
}

function getProductPageTitle() {
  if (isShopKz()) {
    return (
      getTextFromSelectors(document, SHOP_PRODUCT_TITLE_SELECTORS) ||
      sanitizeText(document.title.replace(/\s*\|.*$/, "")) ||
      "Товар без названия"
    );
  }

  if (isSulpak()) {
    return (
      getTextFromSelectors(document, SULPAK_PRODUCT_TITLE_SELECTORS) ||
      sanitizeText(document.title.replace(/\s*\|.*$/, "")) ||
      "Товар без названия"
    );
  }

  if (isISpace()) {
    return (
      getTextFromSelectors(document, ISPACE_PRODUCT_TITLE_SELECTORS) ||
      sanitizeText(document.title.replace(/\s*\|.*$/, "")) ||
      "Товар без названия"
    );
  }

  if (isItmag()) {
    return (
      getTextFromSelectors(document, ITMAG_PRODUCT_TITLE_SELECTORS) ||
      sanitizeText(document.title.replace(/\s*\|.*$/, "")) ||
      "Товар без названия"
    );
  }

  return (
    getTextFromSelectors(document, TECHNODOM_PRODUCT_TITLE_SELECTORS) ||
    sanitizeText(document.title.replace(/\s*\|\s*Technodom.*$/i, "")) ||
    "Товар без названия"
  );
}

function getCatalogProductTitle(priceBlock) {
  const card = findCardContainer(priceBlock);
  if (!card) return "Товар без названия";

  const explicitTitle = getTextFromSelectors(card, TECHNODOM_CARD_TITLE_SELECTORS);
  if (explicitTitle) return explicitTitle;

  const linkedTitle = sanitizeText(
    card.querySelector("a")?.getAttribute("title") ||
      card.querySelector("a")?.textContent
  );

  return linkedTitle || "Товар без названия";
}

function getProductUrl(sourceNode) {
  if (!isTechnodom()) return window.location.href;

  const card = findCardContainer(sourceNode);
  const link =
    card?.querySelector("a[href]") ||
    document.querySelector('link[rel="canonical"]');
  const href = link?.getAttribute("href") || link?.href || window.location.href;

  try {
    return new URL(href, window.location.origin).toString();
  } catch (_err) {
    return window.location.href;
  }
}

async function getRates() {
  const now = Date.now();

  if (cachedRates && now - cachedAt < CACHE_TTL) {
    return cachedRates;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch("https://open.er-api.com/v6/latest/KZT", {
      signal: controller.signal,
    });
    const data = await response.json();
    const usd = data?.rates?.USD;
    const rub = data?.rates?.RUB;
    const isValid = data?.result === "success" && Number(usd) && Number(rub);

    if (!isValid) return cachedRates;

    cachedRates = data.rates;
    cachedAt = now;
    return cachedRates;
  } catch (_err) {
    return cachedRates;
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildProductRecord(title, kzt, rates, sourceNode) {
  const productUrl = getProductUrl(sourceNode);

  return {
    id: `${getStoreName()}:${productUrl}`,
    title,
    productUrl,
    prices: {
      kzt,
      usd: Number((kzt * rates.USD).toFixed(2)),
      rub: Number((kzt * rates.RUB).toFixed(2)),
    },
  };
}

function setBoxData(box, product) {
  box.dataset.productId = product.id;
  box.dataset.productTitle = product.title;
  box.dataset.productUrl = product.productUrl;
  box.dataset.priceKzt = String(product.prices.kzt);
  box.dataset.priceUsd = String(product.prices.usd);
  box.dataset.priceRub = String(product.prices.rub);
}

function renderBoxContent(box, product, compact = false) {
  const label = compact
    ? '<span class="td-converter-box__label">Для сравнения</span>'
    : '<span class="td-converter-box__label">Для сравнения</span>';
  box.dataset.renderVersion = BOX_RENDER_VERSION;
  box.dataset.ownerId = INSTANCE_ID;
  box.innerHTML = `
    ${label}
    <div class="td-converter-box__prices">
      <div>💵 ${formatPrice(product.prices.usd)}&nbsp;USD</div>
      <div>₽ ${formatPrice(product.prices.rub)}&nbsp;RUB</div>
    </div>
    <button class="td-save-product-button" type="button">Добавить в сравнение</button>
    <p class="td-converter-box__status" aria-live="polite"></p>
  `;
}

function upsertBoxAfter(targetNode, className, product, compact = false) {
  cleanupUnexpectedConverterBoxes(document);

  const adjacentBox = targetNode.nextElementSibling;
  const existingBox =
    adjacentBox?.classList.contains(BOX_CLASS)
      ? adjacentBox
      : null;

  if (existingBox && !isExpectedConverterBox(existingBox)) {
    existingBox.remove();
  }

  const box =
    existingBox && isExpectedConverterBox(existingBox)
      ? existingBox
      : document.createElement("div");
  box.className = `${BOX_CLASS} ${className}`.trim();
  setBoxData(box, product);
  renderBoxContent(box, product, compact);

  if (!box.isConnected) {
    targetNode.after(box);
  }
}

async function convertProductPagePrice() {
  const { priceEl, priceBlock, renderAnchor } = getProductPageTarget();
  if (!priceBlock || !priceEl || !renderAnchor) return;

  const kzt = parseKztPrice(priceEl.textContent);
  if (!kzt) return;

  const rates = await getRates();
  if (!rates) return;

  const conversionKey = `${kzt}|${cachedAt}`;
  if (
    priceEl.dataset.lastConversionKey === conversionKey &&
    isExpectedConverterBox(renderAnchor.nextElementSibling)
  ) {
    return;
  }
  priceEl.dataset.lastConversionKey = conversionKey;

  const product = buildProductRecord(getProductPageTitle(), kzt, rates, priceBlock);
  upsertBoxAfter(renderAnchor, "Typography__L Typography__L_Bold", product);
}

function getTechnodomCatalogPriceBlocks() {
  const priceBlocks = Array.from(
    document.querySelectorAll('p[data-testid="product-price"]')
  )
    .map(
      (priceEl) =>
        priceEl.closest('[class*="ProductCardPrices_pricesInfo"]') ||
        priceEl.parentElement
    )
    .filter(Boolean);

  Array.from(document.querySelectorAll(ALTERNATIVE_CARD_CONTAINER_SELECTOR))
    .filter((block) => block.querySelector(ALTERNATIVE_CARD_PRICE_SELECTOR))
    .forEach((block) => {
      if (
        !priceBlocks.includes(block) &&
        isInsideTechnodomCatalogCard(block)
      ) {
        priceBlocks.push(block);
      }
    });

  if (!priceBlocks.length) {
    document
      .querySelectorAll(".ProductCardPrices_pricesInfo__b58jF")
      .forEach((block) => priceBlocks.push(block));
  }

  return priceBlocks;
}

async function convertTechnodomCatalogPrices() {
  if (!isTechnodom()) return;

  const priceBlocks = getTechnodomCatalogPriceBlocks();
  if (!priceBlocks.length) return;

  const rates = await getRates();
  if (!rates) return;

  priceBlocks.forEach((block) => {
    const priceEl =
      block.querySelector('p[data-testid="product-price"]') ||
      block.querySelector(ALTERNATIVE_CARD_PRICE_SELECTOR) ||
      block.querySelector("p");
    if (!priceEl) return;

    const kzt = parseKztPrice(priceEl.textContent);
    if (!kzt) return;

    const conversionKey = `${kzt}|${cachedAt}`;
    if (
      block.dataset.convertedKey === conversionKey &&
      isExpectedConverterBox(block.nextElementSibling)
    ) {
      return;
    }
    block.dataset.convertedKey = conversionKey;

    const product = buildProductRecord(
      getCatalogProductTitle(block),
      kzt,
      rates,
      block
    );
    upsertBoxAfter(
      block,
      "Typography__XS Typography__XS_Regular td-converter-box--compact",
      product,
      true
    );
  });
}

function setSaveStatus(box, message, saved = false) {
  const statusEl = box.querySelector(".td-converter-box__status");
  const button = box.querySelector(".td-save-product-button");

  if (statusEl) {
    statusEl.textContent = message;
  }

  if (button && saved) {
    button.textContent = "Сохранено";
    button.disabled = true;
  }
}

async function handleSaveButtonClick(button) {
  const box = button.closest(`.${BOX_CLASS}`);
  if (!box) return;

  const title = sanitizeText(box.dataset.productTitle);
  const productUrl = box.dataset.productUrl || window.location.href;
  const kzt = Number(box.dataset.priceKzt);
  const usd = Number(box.dataset.priceUsd);
  const rub = Number(box.dataset.priceRub);

  if (!title || !kzt) {
    setSaveStatus(box, "Не получилось определить товар для сохранения.");
    return;
  }

  button.disabled = true;
  setSaveStatus(box, "Сохраняю...");

  try {
    await saveProductForComparison({
      id: box.dataset.productId || `${getStoreName()}:${productUrl}`,
      title,
      productUrl,
      prices: { kzt, usd, rub },
    });
    setSaveStatus(box, "Товар добавлен в список сравнения.", true);
  } catch (_err) {
    button.disabled = false;
    setSaveStatus(box, "Не удалось сохранить товар. Попробуйте ещё раз.");
  }
}

function scheduleConversion() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (!converterEnabled) {
      cleanupConvertedPrices();
      return;
    }

    convertProductPagePrice();
    convertTechnodomCatalogPrices();
  }, 300);
}

function mutationContainsPriceNode(mutation) {
  if (mutation.type === "characterData") {
    const parent = mutation.target?.parentElement;
    if (parent?.closest?.(ANY_BOX_SELECTOR)) return false;
    return parent?.matches?.(PRICE_NODE_SELECTOR) ?? false;
  }

  if (!mutation.addedNodes?.length) return false;

  return Array.from(mutation.addedNodes).some((node) => {
    if (!(node instanceof Element)) return false;

    if (node.classList.contains(BOX_CLASS) || node.classList.contains(LEGACY_BOX_CLASS)) {
      if (!isExpectedConverterBox(node)) {
        node.remove();
      }
      return false;
    }

    const nestedBoxes = node.querySelectorAll?.(ANY_BOX_SELECTOR);
    if (nestedBoxes?.length) {
      nestedBoxes.forEach((box) => {
        if (!isExpectedConverterBox(box)) {
          box.remove();
        }
      });
    }

    if (node.closest(ANY_BOX_SELECTOR)) {
      return false;
    }

    return (
      node.matches(PRICE_NODE_SELECTOR) ||
      Boolean(node.querySelector(PRICE_NODE_SELECTOR))
    );
  });
}

function clearNavigationBurst() {
  navigationBurstTimerIds.forEach((timerId) => clearTimeout(timerId));
  navigationBurstTimerIds = [];
}

function clearTechnodomProductPageLateRender() {
  clearTimeout(technodomProductPageLateRenderTimer);
  technodomProductPageLateRenderTimer = null;
}

function isTechnodomProductPage() {
  const { priceEl } = getTechnodomProductPageTarget();
  return Boolean(priceEl);
}

function scheduleTechnodomProductPageLateRender() {
  if (!converterEnabled || !isTechnodom() || !isTechnodomProductPage()) return;

  clearTechnodomProductPageLateRender();
  technodomProductPageLateRenderTimer = setTimeout(() => {
    if (!converterEnabled) return;
    convertProductPagePrice();
  }, TECHNODOM_PRODUCT_PAGE_LATE_RENDER_MS);
}

function scheduleNavigationBurst() {
  if (!converterEnabled) return;

  clearNavigationBurst();
  navigationBurstTimerIds = NAVIGATION_BURST_DELAYS_MS.map((delay) =>
    setTimeout(() => {
      if (!converterEnabled) return;
      ensureObserver();
      scheduleConversion();
    }, delay)
  );

  scheduleTechnodomProductPageLateRender();
}

function handleUrlChange() {
  const nextUrl = window.location.href;
  if (nextUrl === lastKnownUrl) return;

  lastKnownUrl = nextUrl;
  if (!converterEnabled) return;

  scheduleObserverReattach();
  scheduleNavigationBurst();
}

function scheduleObserverReattach() {
  if (!converterEnabled) return;

  clearTimeout(reattachObserverTimer);
  reattachObserverTimer = setTimeout(() => {
    if (!converterEnabled) return;
    ensureObserver();
    scheduleConversion();
  }, OBSERVER_REATTACH_DELAY_MS);
}

function ensureObserver() {
  const nextRoot = document.documentElement;
  if (!nextRoot) return;

  if (!converterEnabled) {
    observer?.disconnect();
    observedRoot = null;
    return;
  }

  if (observer && observedRoot === nextRoot) return;

  if (!observer) {
    observer = new MutationObserver((mutations) => {
      handleUrlChange();

      const hasRelevantMutation = mutations.some(mutationContainsPriceNode);
      if (!hasRelevantMutation) return;

      scheduleConversion();
    });
  } else {
    observer.disconnect();
  }

  observer.observe(nextRoot, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  observedRoot = nextRoot;
}

function installNavigationHooks() {
  window.addEventListener("popstate", handleUrlChange);
  window.addEventListener("hashchange", handleUrlChange);
  window.addEventListener("load", scheduleNavigationBurst);

  if (!urlPollTimer) {
    urlPollTimer = setInterval(handleUrlChange, URL_POLL_INTERVAL_MS);
  }
}

function installClickHandler() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest(".td-save-product-button");
    if (!button) return;

    event.preventDefault();
    handleSaveButtonClick(button);
  });
}

function setConverterEnabled(nextEnabled) {
  converterEnabled = Boolean(nextEnabled);
  syncConverterVisibility();

  if (!converterEnabled) {
    clearTimeout(debounceTimer);
    clearTimeout(reattachObserverTimer);
    clearNavigationBurst();
    clearTechnodomProductPageLateRender();
    observer?.disconnect();
    observedRoot = null;
    cleanupConvertedPrices();
    return;
  }

  ensureObserver();
  cleanupConvertedPrices();
  cleanupUnexpectedConverterBoxes(document);
  scheduleConversion();
  scheduleNavigationBurst();
}

function installExtensionHooks() {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "TD_CONVERTER_SET_ENABLED") {
      setConverterEnabled(message.enabled);
      sendResponse({ ok: true });
      return true;
    }

    if (message?.type === "TD_CONVERTER_REFRESH") {
      cleanupConvertedPrices();
      scheduleConversion();
      sendResponse({ ok: true });
      return true;
    }

    return false;
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync" || !changes.converterEnabled) return;
    setConverterEnabled(changes.converterEnabled.newValue);
  });
}

function init() {
  ensureConverterVisibilityStyle();
  syncConverterVisibility();
  cleanupUnexpectedConverterBoxes(document);
  ensureObserver();
  installNavigationHooks();
  installExtensionHooks();
  installClickHandler();

  chrome.storage.sync.get({ converterEnabled: true }, (result) => {
    setConverterEnabled(result.converterEnabled);
  });
}

init();
