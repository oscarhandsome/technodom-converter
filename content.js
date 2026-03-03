let debounceTimer = null;
let cachedRates = null;
let cachedAt = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 час (можно 24ч)

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

  const r = await fetch("https://open.er-api.com/v6/latest/KZT");
  const data = await r.json();
  if (data.result !== "success") return null;

  cachedRates = data.rates;
  cachedAt = now;
  return cachedRates;
}

async function convertProductPagePrice() {
  const priceBlock = document.querySelector(
    ".ProductPricesVariantB_block__hevXI"
  );
  const priceEl = priceBlock?.querySelector(
    "p.Typography.Typography__Heading.Typography__Heading_H1"
  );

  if (!priceBlock || !priceEl) return;

  const priceText = priceEl.textContent;
  if (priceEl.dataset.lastPrice === priceText) return;
  priceEl.dataset.lastPrice = priceText;

  const kzt = Number(priceText.replace(/\D/g, ""));
  if (!kzt) return;

  const rates = await getRates();
  if (!rates) return;

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
  const priceBlocks = document.querySelectorAll(
    ".ProductCardPrices_pricesInfo__b58jF"
  );

  if (!priceBlocks.length) return;

  const rates = await getRates();
  if (!rates) return;

  priceBlocks.forEach((block) => {
    if (block.dataset.converted) return;

    const priceEl = block.querySelector('p[data-testid="product-price"]');
    if (!priceEl) return;

    const kzt = Number(priceEl.textContent.replace(/\D/g, ""));
    if (!kzt) return;

    const box = document.createElement("div");
    box.className = "td-converter-box Typography__XS Typography__XS_Regular";
    box.innerHTML = `
      💵 ${formatPrice(kzt * rates.USD)}&nbsp;USD<br>
      ₽ ${formatPrice(kzt * rates.RUB)}&nbsp;RUB
    `;

    block.after(box);
    block.dataset.converted = "1";
  });
}

const observer = new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    convertProductPagePrice();
    convertCatalogPrices();
  }, 300);
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// первый запуск
convertProductPagePrice();
convertCatalogPrices();
