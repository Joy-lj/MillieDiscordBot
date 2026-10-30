import { createHash } from "node:crypto";

export const rarityGroups = ["common", "uncommon", "rare", "special"];

export function validateSets(sets) {
  if (!Array.isArray(sets) || !sets.length || sets.some((set) =>
    !set || typeof set.id !== "string" || !set.id ||
    typeof set.name !== "string" || !set.name.trim()) ||
    new Set(sets.map((set) => set.id)).size !== sets.length) {
    throw new Error("TCGdex returned an invalid or empty set list. Existing manifest was kept.");
  }
  return sets;
}

export function createSetPack(set, importedGroups = null) {
  // Pending sets require a sync before the store can make their packs available.
  const available = new Set(importedGroups ?? rarityGroups);
  if (!available.size || [...available].some((group) => !rarityGroups.includes(group))) {
    throw new Error(`Invalid rarity groups for ${set.id}.`);
  }
  const prefer = (order) => {
    const group = order.find((candidate) => available.has(candidate));
    if (!group) throw new Error(`No eligible card groups for ${set.id}.`);
    return { [group]: 1 };
  };
  const weighted = (weights) => {
    const entries = Object.entries(weights).filter(([group]) => available.has(group));
    return entries.length ? Object.fromEntries(entries)
      : prefer(["special", "rare", "uncommon", "common"]);
  };
  // Short, deterministic lowercase IDs fit Discord component custom IDs even
  // when upstream set IDs contain uppercase letters or punctuation.
  const key = createHash("sha256").update(set.id).digest("hex").slice(0, 16);
  return {
    id: `set-${key}`,
    name: `${set.name} Pack`,
    setIds: [set.id],
    price: 500,
    sellPrice: 300,
    version: 1,
    color: 0x63acff,
    description: `Five custom virtual pulls from ${set.name}. See the slot odds below.`,
    slots: [
      prefer(["common", "uncommon", "rare", "special"]),
      prefer(["common", "uncommon", "rare", "special"]),
      prefer(["uncommon", "common", "rare", "special"]),
      weighted({ uncommon: 60, rare: 30, special: 10 }),
      weighted({ rare: 80, special: 20 }),
    ],
  };
}

export function buildManifest(sets, groupsBySet) {
  validateSets(sets);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sets: sets.map((set) => ({
      id: set.id,
      name: set.name,
      importedGroups: groupsBySet.get(set.id) ?? null,
    })),
  };
}

export function manifestPacks(manifest) {
  if (manifest.schemaVersion !== 1) throw new Error("Unsupported card set manifest version.");
  validateSets(manifest.sets);
  return manifest.sets.map((set) => createSetPack(set, set.importedGroups));
}
