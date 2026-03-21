const enabledToggle = document.getElementById("enabled-toggle");
const refreshButton = document.getElementById("refresh-button");
const clearSavedButton = document.getElementById("clear-saved-button");
const statusEl = document.getElementById("status");
const savedProductsListEl = document.getElementById("saved-products-list");

const TECHNODOM_HOST_RE = /(^|\.)technodom\.kz$/i;
const SHOP_HOST_RE = /(^|\.)shop\.kz$/i;
const SULPAK_HOST_RE = /(^|\.)sulpak\.kz$/i;
const ISPACE_HOST_RE = /(^|\.)ispace\.kz$/i;
const ITMAG_HOST_RE = /(^|\.)itmag\.kz$/i;
const SAVED_PRODUCTS_KEY = "savedProducts";
const FETCH_TIMEOUT_MS = 7000;

let cachedRates = null;
let cachedAt = 0;

function setStatus(message) {
  statusEl.textContent = message;
}

function normalizeTitle(title) {
  return String(title || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("ru-RU");
}

function normalizeColor(title) {
  const normalized = normalizeTitle(title);
  const colorMap = [
    ["starlight", "starlight"],
    ["серый космос", "spacegray"],
    ["space gray", "spacegray"],
    ["spacegrey", "spacegray"],
    ["space gray", "spacegray"],
    ["midnight", "midnight"],
    ["темная ночь", "midnight"],
    ["тёмная ночь", "midnight"],
    ["sky blue", "skyblue"],
    ["небесно-голубой", "skyblue"],
    ["silver", "silver"],
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

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatRate(value, digits = 4) {
  return Number(value || 0).toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

async function getRates() {
  const now = Date.now();
  if (cachedRates && now - cachedAt < 60 * 60 * 1000) {
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

function getStoredEnabled() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ converterEnabled: true }, (result) => {
      resolve(Boolean(result.converterEnabled));
    });
  });
}

function setStoredEnabled(enabled) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ converterEnabled: enabled }, resolve);
  });
}

function getSavedProducts() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [SAVED_PRODUCTS_KEY]: [] }, (result) => {
      resolve(Array.isArray(result[SAVED_PRODUCTS_KEY]) ? result[SAVED_PRODUCTS_KEY] : []);
    });
  });
}

function clearSavedProducts() {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [SAVED_PRODUCTS_KEY]: [] }, resolve);
  });
}

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0] || null);
    });
  });
}

function sendMessageToTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, () => {
      resolve(chrome.runtime.lastError ? null : true);
    });
  });
}

function isSupportedTab(tab) {
  if (!tab?.url) return false;

  try {
    const hostname = new URL(tab.url).hostname;
    return (
      TECHNODOM_HOST_RE.test(hostname) ||
      SHOP_HOST_RE.test(hostname) ||
      SULPAK_HOST_RE.test(hostname) ||
      ISPACE_HOST_RE.test(hostname) ||
      ITMAG_HOST_RE.test(hostname)
    );
  } catch (_err) {
    return false;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char];
  });
}

function hydrateSavedItem(item) {
  const title = String(item?.title || "").trim() || "Товар без названия";
  const kzt = Number(item?.prices?.kzt || 0);
  const normalizedTitle = normalizeTitle(title);

  return {
    ...item,
    title,
    titleKey: item?.titleKey || normalizedTitle,
    compareKey: item?.compareKey || buildComparisonKey(title),
    profile: buildMatchProfile(title),
    prices: {
      kzt,
      usd: Number(item?.prices?.usd || 0),
      rub: Number(item?.prices?.rub || 0),
    },
  };
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

function arraysIntersect(left, right) {
  if (!left.length || !right.length) return false;
  const rightSet = new Set(right);
  return left.some((item) => rightSet.has(item));
}

function getSmartMatchScore(item, candidate) {
  const left = item.profile;
  const right = candidate.profile;

  let score = 0;

  if (left.family && left.family === right.family) score += 3;
  if (left.chip && left.chip === right.chip) score += 4;
  if (left.ram && left.ram === right.ram) score += 3;
  if (left.storage && left.storage === right.storage) score += 3;
  if (left.size && left.size === right.size) score += 2;
  if (left.color && left.color === right.color) score += 1;
  if (arraysIntersect(left.modelMatches, right.modelMatches)) score += 5;
  if (arraysIntersect(left.skuMatches, right.skuMatches)) score += 6;

  return score;
}

function chooseComparisonBase(items, currentIndex, fallbackBase) {
  const currentItem = items[currentIndex];
  const previousItems = items.slice(0, currentIndex);

  let bestCandidate = null;
  let bestScore = 0;

  previousItems.forEach((candidate) => {
    const score = getSmartMatchScore(currentItem, candidate);
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  });

  if (bestCandidate && bestScore >= 7) {
    return {
      item: bestCandidate,
      mode: "smart",
    };
  }

  return {
    item: fallbackBase,
    mode: "fallback",
  };
}

function withConvertedPrices(item, rates) {
  if (!rates) return item;

  const kzt = Number(item.prices?.kzt || 0);
  return {
    ...item,
    prices: {
      kzt,
      usd: Number((kzt * rates.USD).toFixed(2)),
      rub: Number((kzt * rates.RUB).toFixed(2)),
    },
  };
}

function getPriceTrend(currentValue, baseValue, currencySymbol) {
  const diff = Number(currentValue || 0) - Number(baseValue || 0);

  if (diff > 0) {
    return {
      symbol: "↑",
      className: "saved-product__trend--up",
      label: `дороже на ${formatNumber(diff)} ${currencySymbol}`,
    };
  }

  if (diff < 0) {
    return {
      symbol: "↓",
      className: "saved-product__trend--down",
      label: `дешевле на ${formatNumber(Math.abs(diff))} ${currencySymbol}`,
    };
  }

  return {
    symbol: "=",
    className: "saved-product__trend--same",
    label: "цена совпадает",
  };
}

function renderPriceWithTrend(value, trend, suffix) {
  const trendHtml = trend
    ? ` <span class="saved-product__trend-wrap"><span class="saved-product__trend ${trend.className}" title="${escapeHtml(
        trend.label
      )}">${trend.symbol}</span><span class="saved-product__trend-diff">${escapeHtml(
        trend.label
      )}</span></span>`
    : "";

  return `<span>${escapeHtml(formatNumber(value))} ${suffix}</span>${trendHtml}`;
}

function renderSavedProducts(items, rates = null) {
  if (!items.length) {
    savedProductsListEl.innerHTML =
      '<p class="saved-products__empty">Пока пусто. Нажмите "Добавить в сравнение" возле цены товара.</p>';
    return;
  }

  const normalizedItems = items.map(hydrateSavedItem).map((item) => withConvertedPrices(item, rates));
  const baseItem = normalizedItems[0] || null;

  savedProductsListEl.innerHTML = normalizedItems
    .map((item, index) => {
      const isBaseItem = item.id === baseItem?.id;
      const comparisonBase = isBaseItem
        ? { item: null, mode: "base" }
        : chooseComparisonBase(normalizedItems, index, baseItem);
      const targetBase = comparisonBase.item;
      const kztTrend = isBaseItem
        ? null
        : getPriceTrend(item.prices?.kzt, targetBase?.prices?.kzt, "₸");
      const usdTrend = isBaseItem
        ? null
        : getPriceTrend(item.prices?.usd, targetBase?.prices?.usd, "USD");
      const rubTrend = isBaseItem
        ? null
        : getPriceTrend(item.prices?.rub, targetBase?.prices?.rub, "RUB");
      const compareText = isBaseItem
        ? 'базовая цена'
        : comparisonBase.mode === "smart"
        ? `умное совпадение: сравнение с похожим товаром "${escapeHtml(targetBase?.title || "товаром") }"`
        : `сравнение с 1-м товаром: ${escapeHtml(baseItem?.title || "базой")}`;

      return `
        <article class="saved-product">
          <p class="saved-product__title">${escapeHtml(item.title || "Без названия")}</p>
          <p class="saved-product__meta">${escapeHtml(item.store || "Магазин")}</p>
          <p class="saved-product__price-row">
            <span class="saved-product__price-label">₸</span>
            ${renderPriceWithTrend(item.prices?.kzt || 0, kztTrend, "KZT")}
          </p>
          <p class="saved-product__prices">
            <span class="saved-product__price-line">
              <span class="saved-product__price-label">💵</span>
              ${renderPriceWithTrend(item.prices?.usd || 0, usdTrend, "USD")}
            </span><br>
            <span class="saved-product__price-line">
              <span class="saved-product__price-label">₽</span>
              ${renderPriceWithTrend(item.prices?.rub || 0, rubTrend, "RUB")}
            </span>
          </p>
          <p class="saved-product__compare"><span class="saved-product__compare-note">${compareText}</span></p>
        </article>
      `;
    })
    .join("");
}

async function syncUi() {
  const enabled = await getStoredEnabled();
  const activeTab = await getActiveTab();
  const supportedTab = isSupportedTab(activeTab);
  const savedProducts = await getSavedProducts();
  const rates = await getRates();

  enabledToggle.checked = enabled;
  refreshButton.disabled = !supportedTab;
  clearSavedButton.disabled = !savedProducts.length;
  renderSavedProducts(savedProducts, rates);

  if (!supportedTab) {
    setStatus("Откройте страницу technodom.kz, shop.kz, sulpak.kz, ispace.kz или itmag.kz.");
    return;
  }

  if (!rates) {
    setStatus("Не удалось обновить курс. В popup показаны сохранённые значения.");
    return;
  }

  const rateInfo = `Курс: 1 KZT = ${formatRate(rates.USD, 5)} USD, ${formatRate(
    rates.RUB,
    5
  )} RUB.`;

  setStatus(
    enabled
      ? `Конвертация и кнопка сравнения активны на текущей вкладке. ${rateInfo}`
      : `Функции на странице отключены. ${rateInfo}`
  );
}

enabledToggle.addEventListener("change", async () => {
  const enabled = enabledToggle.checked;
  await setStoredEnabled(enabled);

  const activeTab = await getActiveTab();
  if (activeTab?.id && isSupportedTab(activeTab)) {
    await sendMessageToTab(activeTab.id, {
      type: "TD_CONVERTER_SET_ENABLED",
      enabled,
    });
  }

  setStatus(enabled ? "Функции на странице включены." : "Функции на странице выключены.");
});

refreshButton.addEventListener("click", async () => {
  const activeTab = await getActiveTab();
  if (!activeTab?.id || !isSupportedTab(activeTab)) {
    setStatus("Текущая вкладка не относится к technodom.kz или shop.kz.");
    return;
  }

  const delivered = await sendMessageToTab(activeTab.id, {
    type: "TD_CONVERTER_REFRESH",
  });

  setStatus(
    delivered
      ? "Обновление отправлено на текущую вкладку."
      : "Не удалось связаться со страницей. Попробуйте перезагрузить вкладку."
  );
});

clearSavedButton.addEventListener("click", async () => {
  await clearSavedProducts();
  renderSavedProducts([]);
  clearSavedButton.disabled = true;
  setStatus("Список сравнения очищен.");
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[SAVED_PRODUCTS_KEY]) return;

  const items = Array.isArray(changes[SAVED_PRODUCTS_KEY].newValue)
    ? changes[SAVED_PRODUCTS_KEY].newValue
    : [];

  clearSavedButton.disabled = !items.length;
  renderSavedProducts(items, cachedRates);
});

document.addEventListener("DOMContentLoaded", syncUi);
