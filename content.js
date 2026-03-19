let debounceTimer = null;
let cachedRates = null;
let cachedAt = 0;
let observer = null;
let observedRoot = null;
let reattachObserverTimer = null;
let lastKnownUrl = window.location.href;
let navigationBurstTimerIds = [];
let urlPollTimer = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 час (можно 24ч)
const PRODUCT_CARD_CLASS_HINT = '[class*="ProductCard"]';
const FETCH_TIMEOUT_MS = 7000;
const PRICE_NODE_SELECTOR =
  'p[data-testid="product-price"], .ProductCardPrices_pricesInfo__b58jF, .ProductPricesVariantB_block__hevXI';
const OBSERVER_REATTACH_DELAY_MS = 1000;
const NAVIGATION_BURST_DELAYS_MS = [0, 400, 1200, 2500, 4000];
const URL_POLL_INTERVAL_MS = 500;

function formatPrice(value) {
  return value
    .toLocaleString("ru-RU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    .replace(/\s/g, "&nbsp;");
}

async function getRates() {
  const now = Date.now();

  if (cachedRates && now - cachedAt < CACHE_TTL) {
    return cachedRates;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const r = await fetch("https://open.er-api.com/v6/latest/KZT", {
      signal: controller.signal,
    });
    const data = await r.json();

    const usd = data?.rates?.USD;
    const rub = data?.rates?.RUB;
    const isValid = data?.result === "success" && Number(usd) && Number(rub);

    if (!isValid) {
      return cachedRates;
    }

    cachedRates = data.rates;
    cachedAt = now;
    return cachedRates;
  } catch (_err) {
    return cachedRates;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function convertProductPagePrice() {
  const productPriceCandidates = Array.from(
    document.querySelectorAll('p[data-testid="product-price"]')
  ).filter((node) => !node.closest(PRODUCT_CARD_CLASS_HINT));

  const fallbackPriceEl = document.querySelector(
    ".ProductPricesVariantB_block__hevXI p.Typography.Typography__Heading.Typography__Heading_H1"
  );
  const priceEl = productPriceCandidates[0] || fallbackPriceEl;
  const priceBlock =
    priceEl?.closest(".ProductPricesVariantB_block__hevXI") ||
    priceEl?.parentElement;

  if (!priceBlock || !priceEl) return;

  const priceText = priceEl.textContent;
  const kzt = Number(priceText.replace(/\D/g, ""));
  if (!kzt) return;

  const rates = await getRates();
  if (!rates) return;

  const conversionKey = `${priceText}|${cachedAt}`;
  if (priceEl.dataset.lastConversionKey === conversionKey) return;
  priceEl.dataset.lastConversionKey = conversionKey;

  const oldBox = priceBlock.parentElement.querySelector(".td-converter-box");
  if (oldBox) oldBox.remove();

  const box = document.createElement("div");
  box.className = "td-converter-box Typography__L Typography__L_Bold";
  box.innerHTML = `
    💵 ${formatPrice(kzt * rates.USD)}&nbsp;USD<br>
    ₽ ${formatPrice(kzt * rates.RUB)}&nbsp;RUB
  `;

  priceBlock.after(box);
}

async function convertCatalogPrices() {
  const priceBlocks = Array.from(
    document.querySelectorAll('p[data-testid="product-price"]')
  )
    .map(
      (priceEl) =>
        priceEl.closest('[class*="ProductCardPrices_pricesInfo"]') ||
        priceEl.parentElement
    )
    .filter(Boolean);

  if (!priceBlocks.length) {
    const fallbackBlocks = document.querySelectorAll(
      ".ProductCardPrices_pricesInfo__b58jF"
    );
    fallbackBlocks.forEach((block) => priceBlocks.push(block));
  }

  if (!priceBlocks.length) return;

  const rates = await getRates();
  if (!rates) return;

  priceBlocks.forEach((block) => {
    const priceEl =
      block.querySelector('p[data-testid="product-price"]') ||
      block.querySelector("p");
    if (!priceEl) return;

    const kzt = Number(priceEl.textContent.replace(/\D/g, ""));
    if (!kzt) return;

    const conversionKey = `${kzt}|${cachedAt}`;
    if (block.dataset.convertedKey === conversionKey) return;

    const existingBox =
      block.nextElementSibling?.classList.contains("td-converter-box")
        ? block.nextElementSibling
        : null;
    const box = existingBox || document.createElement("div");
    box.className = "td-converter-box Typography__XS Typography__XS_Regular";
    box.innerHTML = `
      💵 ${formatPrice(kzt * rates.USD)}&nbsp;USD<br>
      ₽ ${formatPrice(kzt * rates.RUB)}&nbsp;RUB
    `;

    if (!box.isConnected) {
      block.after(box);
    }
    block.dataset.convertedKey = conversionKey;
  });
}

function scheduleConversion() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    convertProductPagePrice();
    convertCatalogPrices();
  }, 300);
}

function mutationContainsPriceNode(mutation) {
  if (mutation.type === "characterData") {
    return mutation.target?.parentElement?.matches?.(PRICE_NODE_SELECTOR) ?? false;
  }

  if (!mutation.addedNodes?.length) return false;

  return Array.from(mutation.addedNodes).some((node) => {
    if (!(node instanceof Element)) return false;
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

function scheduleNavigationBurst() {
  clearNavigationBurst();
  navigationBurstTimerIds = NAVIGATION_BURST_DELAYS_MS.map((delay) =>
    setTimeout(() => {
      ensureObserver();
      scheduleConversion();
    }, delay)
  );
}

function handleUrlChange() {
  const nextUrl = window.location.href;
  if (nextUrl === lastKnownUrl) return;

  lastKnownUrl = nextUrl;
  scheduleObserverReattach();
  scheduleNavigationBurst();
}

function scheduleObserverReattach() {
  clearTimeout(reattachObserverTimer);
  reattachObserverTimer = setTimeout(() => {
    ensureObserver();
    scheduleConversion();
  }, OBSERVER_REATTACH_DELAY_MS);
}

function ensureObserver() {
  const nextRoot = document.documentElement;
  if (!nextRoot) return;

  if (observer && observedRoot === nextRoot) {
    return;
  }

  if (!observer) {
    observer = new MutationObserver((mutations) => {
      handleUrlChange();

      const hasRelevantMutation = mutations.some((mutation) => {
        if (mutationContainsPriceNode(mutation)) return true;
        return mutation.type === "childList" || mutation.type === "characterData";
      });

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

function init() {
  ensureObserver();
  installNavigationHooks();

  scheduleNavigationBurst();
}

init();
