import { readFileSync } from "node:fs";
import { manifestPacks } from "../../services/cardSetPacks.js";
import { applyPackPrices } from "../../services/cardPackPricing.js";
import {
  packDefinitions as customPacks, groupLabels, rarityGroup,
} from "./cardShopCustom.js";

export { groupLabels, rarityGroup };

let manifest;
try {
  manifest = JSON.parse(readFileSync(
    new URL("../../data/cardshop-set-manifest.json", import.meta.url), "utf8"
  ));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  console.warn("All-set packs are not generated yet. Run scripts/sync-all-card-sets.js.");
}

const generated = manifest ? manifestPacks(manifest) : [];
const existingIds = new Set(customPacks.map((pack) => pack.id));

// Apply the same source-set price to generated and custom packs.
export const packDefinitions = [
  ...customPacks,
  ...applyPackPrices(generated.filter((pack) => !existingIds.has(pack.id))),
];
