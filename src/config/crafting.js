// Materials use your existing user_items inventory, one row per copy.
const material = (name, rarity, description) => ({
  name, type: "material", slot: null, stat: 0, stats: {}, price: 0,
  purchasable: false, sellable: false, salvageable: false, source: "dungeon",
  description, use: "Crafting ingredient. Cannot be equipped.",
  dungeon: { rarity },
});

export const MATERIAL_ITEMS = {
  "catsteel-scrap": material("Catsteel Scrap", "common", "Metal recovered from unwanted equipment and dungeon debris."),
  "enchanted-fur": material("Enchanted Fur", "uncommon", "Soft enchanted fibers salvaged from armor and found in catacombs."),
  "eternal-cosmic-cat-orb": material("Eternal Cosmic Cat Orb", "mythic", "A tiny feline cosmos capable of awakening Millie's Wrath."),
};

export const craftingConfig = {
  eternalWrath: { attackMultiplier: 1.35, critBonus: 0.05 },
  recipes: {
    "millies-eternal-wrath": {
      name: "Millie's Eternal Wrath", baseItemId: "millies-wrath",
      ingredients: [{ itemId: "millies-wrath", quantity: 1 }, { itemId: "eternal-cosmic-cat-orb", quantity: 1 }],
      outputItemId: "millies-eternal-wrath", fee: 0,
    },
  },
  salvageByRarity: { common: 1, uncommon: 2, rare: 4, epic: 8, legendary: 16, mythic: 32 },
  salvageMaterialByType: { weapon: "catsteel-scrap", armor: "enchanted-fur", accessory: "catsteel-scrap" },
  salvageMaterialBySlot: { off_hand: "catsteel-scrap" },
  // Basis points: 10 / 10,000 = 0.1%. These replace currency-only outcomes.
  materialDrops: {
    easy: [{ itemId: "catsteel-scrap", bps: 1500 }, { itemId: "enchanted-fur", bps: 1500 }],
    normal: [{ itemId: "catsteel-scrap", bps: 1500 }, { itemId: "enchanted-fur", bps: 1500 }],
    hard: [{ itemId: "catsteel-scrap", bps: 1200 }, { itemId: "enchanted-fur", bps: 1200 }, { itemId: "eternal-cosmic-cat-orb", bps: 10 }],
  },
};

// Apply LAST to your existing completed catalog. Do not import ITEMS here.
export function withCraftingItems(catalog) {
  const base = catalog["millies-wrath"];
  if (!base || base.type !== "weapon" || base.slot !== "main_hand" || !Number.isFinite(base.stats?.attack)) {
    throw new Error("Crafting requires the slot-based millies-wrath item in your catalog.");
  }
  const attack = Math.round(base.stats.attack * craftingConfig.eternalWrath.attackMultiplier);
  const critChance = Math.min(1, Number(base.stats.critChance ?? 0) + craftingConfig.eternalWrath.critBonus);
  if (!Number.isSafeInteger(attack) || attack < base.stats.attack || !Number.isFinite(critChance) || critChance < 0) {
    throw new Error("Invalid Eternal Wrath stats.");
  }
  const additions = {
    ...structuredClone(MATERIAL_ITEMS),
    "millies-eternal-wrath": {
      ...structuredClone(base), name: "Millie's Eternal Wrath", stat: attack,
      stats: { ...base.stats, attack, critChance },
      price: 0, purchasable: false, sellable: false, salvageable: false, source: "crafting",
      description: "Millie's legendary fury awakened by an Eternal Cosmic Cat Orb.",
      use: "Equip to wield Millie's cosmic fury.",
      dungeon: { ...structuredClone(base.dungeon ?? {}), rarity: "mythic", critChance },
    },
  };
  for (const id of Object.keys(additions)) if (Object.hasOwn(catalog, id)) throw new Error(`Crafting item already exists: ${id}`);
  return { ...catalog, ...additions };
}

// Wrap your existing dungeonLootTables with this; existing gear odds stay intact.
export function withMaterialDrops(tables) {
  const result = structuredClone(tables);
  for (const [difficulty, drops] of Object.entries(craftingConfig.materialDrops)) {
    if (!result[difficulty]) continue;
    const table = result[difficulty];
    const total = table.reduce((sum, row) => sum + row.weight, 0);
    if (!Number.isSafeInteger(total) || total < 1) throw new Error("Invalid loot table total.");
    const additions = drops.map(drop => {
      const weight = total * drop.bps / 10_000;
      if (!MATERIAL_ITEMS[drop.itemId] || !Number.isSafeInteger(weight) || weight < 1 || table.some(row => row.itemId === drop.itemId)) {
        throw new Error(`Invalid or duplicate material drop: ${drop.itemId}`);
      }
      return { itemId: drop.itemId, weight };
    });
    const needed = additions.reduce((sum, row) => sum + row.weight, 0);
    const empty = table.find(row => row.itemId === null);
    if (!empty || empty.weight < needed) throw new Error("Material drops need enough currency-only loot weight.");
    empty.weight -= needed;
    result[difficulty] = [...table.filter(row => row.weight > 0), ...additions];
  }
  return result;
}
