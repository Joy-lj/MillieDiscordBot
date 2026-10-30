import { readFileSync } from "node:fs";
import {
  CURRENCY_PER_USD, SELL_BACK_RATIO, USD_OVERRIDES, REFERENCE_PRICES,
} from "../src/config/cardPackPricing.js";

export function usdToCurrency(usd, ratio = CURRENCY_PER_USD) {
  if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0 ||
      typeof ratio !== "number" || !Number.isFinite(ratio) || ratio <= 0) {
    throw new Error("USD price and conversion ratio must be positive numbers.");
  }
  const price = Math.max(1, Math.round(usd * ratio));
  if (!Number.isSafeInteger(price)) throw new Error("Converted price exceeds the supported limit.");
  return price;
}

function loadPrices() {
  try {
    const data = JSON.parse(readFileSync(new URL("../data/cardshop-market-prices.json", import.meta.url), "utf8"));
    if (data.schemaVersion !== 1 || !data.sets || typeof data.sets !== "object" || Array.isArray(data.sets)) {
      throw new Error("Invalid market price cache.");
    }
    return data.sets;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return {};
  }
}

const cachedPrices = loadPrices();

export function pricePack(pack) {
  // A mixed-set pack has no single corresponding real booster product.
  // The supplied configs use one source set per pack.
  if (new Set(pack.setIds).size !== 1) {
    return { pack: null, reason: "mixed-set packs require a separately chosen price" };
  }
  const setId = pack.setIds[0];
  const usd = USD_OVERRIDES[setId] ?? cachedPrices[setId]?.usd ?? REFERENCE_PRICES[setId]?.usd;
  if (usd === undefined) return { pack: null, reason: `no verified booster price for ${setId}` };
  const price = usdToCurrency(usd);
  if (!Number.isFinite(SELL_BACK_RATIO) || SELL_BACK_RATIO < 0 || SELL_BACK_RATIO > 1) {
    throw new Error("SELL_BACK_RATIO must be between 0 and 1.");
  }
  return { pack: { ...pack, price, sellPrice: Math.floor(price * SELL_BACK_RATIO) } };
}

export function applyPackPrices(packs) {
  const result = [];
  const unavailable = [];
  for (const original of packs) {
    const priced = pricePack(original);
    if (priced.pack) result.push(priced.pack);
    else unavailable.push(`${original.name} (${priced.reason})`);
  }
  if (unavailable.length) {
    console.warn(`Market pricing: ${unavailable.length} unpriced pack(s) omitted. ` +
      "Run scripts/sync-card-pack-prices.js or add USD_OVERRIDES in src/config/cardPackPricing.js. " +
      `Examples: ${unavailable.slice(0, 5).join("; ")}`);
  }
  return result;
}

export function normalizeSetName(name) {
  let value = String(name).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  value = value.replace(/^[a-z]+\d*(?:\.\d+)?\s*:\s*/, "").replace(/^ex\s+/, "");
  value = value.replace(/&amp;/g, " and ").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
  if (value !== "base set") value = value.replace(/ base set$/, "");
  return value;
}

export function findGroup(set, groups, override) {
  const matches = override !== undefined
    ? groups.filter((group) => group.groupId === override)
    : groups.filter((group) => normalizeSetName(group.name) === normalizeSetName(set.name));
  return matches.length === 1 ? matches[0] : null;
}

function isLooseBooster(name) {
  return /\bbooster pack\b/i.test(name) &&
    !/\b(box|bundle|blister|sleeved|case|display|lot|graded|psa|bgs|cgc|heavy|light|weighed|shadowless|japanese|korean|french|german|italian|spanish|portuguese|empty|wrapper|sample|mini|fun)\b|\b(?:1st|first)\s+edition\b|\bset\s+of\b|\bart\s+set\b|\b[2-9]\d*\s*-?\s*packs?\b/i.test(name);
}

export function selectBooster(products, prices, override) {
  const candidates = products.filter((product) =>
    isLooseBooster(product.name ?? "") &&
    (override === undefined || product.productId === override)
  );
  // Prefer an unqualified loose pack or an Unlimited pack over artwork variants.
  const generic = candidates.filter((product) =>
    /booster pack\s*$/i.test(product.name) || /unlimited/i.test(product.name)
  );
  const eligible = override !== undefined ? candidates : generic.length ? generic : candidates;
  if (eligible.length !== 1) return null;
  const product = eligible[0];
  const observations = prices.filter((price) => price.productId === product.productId &&
    typeof price.marketPrice === "number" && Number.isFinite(price.marketPrice) && price.marketPrice > 0);
  const distinct = [...new Set(observations.map((price) => price.marketPrice))];
  if (distinct.length !== 1) return null;
  usdToCurrency(distinct[0]);
  return { product, usd: distinct[0] };
}
