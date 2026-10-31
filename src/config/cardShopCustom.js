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

  holo_rare: "Holo Rare",
  double_rare: "Double Rare",
  ultra_rare: "Ultra Rare",
  illustration_rare: "Illustration Rare",
  special_illustration_rare: "Special Illustration Rare",
  hyper_rare: "Hyper Rare",
  ace_spec_rare: "ACE SPEC Rare",

  secret_rare: "Secret Rare",
  radiant_rare: "Radiant Rare",
  amazing_rare: "Amazing Rare",
  shiny_rare: "Shiny Rare",
  shiny_ultra_rare: "Shiny Ultra Rare",
  holo_rare_v: "Holo Rare V",
  holo_rare_vmax: "Holo Rare VMAX",
  holo_rare_vstar: "Holo Rare VSTAR",
  full_art_trainer: "Full Art Trainer",
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