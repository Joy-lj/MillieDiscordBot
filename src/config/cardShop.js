import { readFileSync } from "node:fs";
import { manifestPacks } from "../../services/cardSetPacks.js";

// FIRST rename your existing config/cardShop.js to config/cardShopCustom.js.
// It preserves all your current packs, prices, odds, and rarity mapping.
import {
  packDefinitions as customPacks,
  groupLabels,
  rarityGroup,
} from "./cardShopCustom.js";

export { groupLabels, rarityGroup };

// Prices are in your bot's currency, not real money.
const DEFAULT_SET_PRICE = 2500;
const DEFAULT_SET_SELL_PRICE = 1250;

// Optional changes keyed by the ORIGINAL TCGdex set ID.
// Sell prices must be <= buy prices.
const SET_OVERRIDES = {
  base1: { price: 50000, sellPrice: 25000 },
  swsh3: { price: 2000, sellPrice: 1000 },
  sv06: { price: 2000, sellPrice: 1000 },
};

const manifestPath = new URL("../../data/cardshop-set-manifest.json", import.meta.url);
let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  console.warn("All-set packs are not generated yet. Run scripts/sync-all-card-sets.js.");
}

const generated = manifest ? manifestPacks(manifest) : [];
const existingIds = new Set(customPacks.map((pack) => pack.id));

export const packDefinitions = [
  ...customPacks,
  ...generated.filter((pack) => !existingIds.has(pack.id)).map((pack) => ({
    ...pack,
    price: DEFAULT_SET_PRICE,
    sellPrice: DEFAULT_SET_SELL_PRICE,
    ...SET_OVERRIDES[pack.setIds[0]],
  })),
];
