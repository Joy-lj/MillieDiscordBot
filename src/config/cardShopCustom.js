import { applyPackPrices } from "../../services/cardPackPricing.js";

const customPacks = [];

export const packDefinitions = applyPackPrices(customPacks);

// These are internal selection pools.
// Individual cards retain their actual TCGdex rarity.
export const groupLabels = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  special: "Other Rarities",
};

export function rarityGroup(rarity) {
  if (typeof rarity !== "string" || !rarity.trim()) {
    throw new Error("Card rarity is missing.");
  }

  const value = rarity.trim().toLowerCase();

  if (value === "common") return "common";
  if (value === "uncommon") return "uncommon";
  if (value === "rare") return "rare";

  return "special";
}