import { applyPackPrices } from "../../services/cardPackPricing.js";

// Custom virtual odds; these do not reproduce official booster collation.
// price/sellPrice are assigned from the source set's USD price below.
const customPacks = [
  {
    id: "classic", name: "Classic Garden", setIds: ["base1"],
    version: 1, color: 0x39c995,
    description: "Five Base Set pulls with a guaranteed Rare.",
    slots: [{ common: 1 }, { common: 1 }, { uncommon: 1 }, { uncommon: 70, rare: 30 }, { rare: 1 }],
  },
  {
    id: "night", name: "Midnight Bloom", setIds: ["swsh3"],
    version: 1, color: 0x9775fa,
    description: "Five Darkness Ablaze pulls. Final slot: 80% Rare, 20% Special.",
    slots: [{ common: 1 }, { common: 1 }, { uncommon: 1 }, { uncommon: 60, rare: 40 }, { rare: 80, special: 20 }],
  },
  {
    id: "prism", name: "Prismatic Vault", setIds: ["swsh3"],
    version: 1, color: 0xf4bd51,
    description: "Five Darkness Ablaze pulls with a guaranteed Special.",
    slots: [{ uncommon: 1 }, { rare: 1 }, { rare: 80, special: 20 }, { rare: 60, special: 40 }, { special: 1 }],
  },
  {
    id: "twilight", name: "Twilight Masquerade", setIds: ["sv06"],
    version: 1, color: 0x39c995,
    description: "Five Twilight Masquerade pulls with a guaranteed Rare.",
    slots: [{ common: 1 }, { common: 1 }, { uncommon: 1 }, { uncommon: 70, rare: 30 }, { rare: 1 }],
  },
];

export const packDefinitions = applyPackPrices(customPacks);
export const groupLabels = {
  common: "Common", uncommon: "Uncommon", rare: "Rare", special: "Special",
};

export function rarityGroup(rarity) {
  if (typeof rarity !== "string" || !rarity.trim()) throw new Error("Card rarity is missing.");
  const value = rarity.trim().toLowerCase();
  return ["common", "uncommon", "rare"].includes(value) ? value : "special";
}
