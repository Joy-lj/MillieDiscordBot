import { ABILITIES, ARMOR_PASSIVES } from "../../services/dungeonAbilities.js";

// Materials use your existing user_items inventory, one row per copy.
const material = (name, rarity, description) => ({
  name, type: "material", slot: null, stat: 0, stats: {}, price: 0,
  purchasable: false, sellable: false, salvageable: false, source: "dungeon",
  description, use: "Crafting ingredient. Cannot be equipped.",
  dungeon: { rarity },
});

export const MATERIAL_ITEMS = {
  "cosmic-shard": material("Cosmic Shard", "legendary", "Guaranteed progress from an Ultra clear. Exchange shards in !craft for rare components."),
  "catsteel-scrap": material("Catsteel Scrap", "common", "Metal recovered from unwanted equipment and dungeon debris."),
  "enchanted-fur": material("Enchanted Fur", "uncommon", "Soft enchanted fibers salvaged from armor and found in catacombs."),
  "eternal-cosmic-cat-orb": material("Eternal Cosmic Cat Orb", "mythic", "A tiny feline cosmos capable of awakening Millie's Wrath."),
  "moonlit-fang": material("Moonlit Fang", "epic", "A moonlit fang used to turn a katana into a life-stealing blade."),
  "starforged-core": material("Starforged Core", "legendary", "A celestial firing core that gives a cannon powerful armor penetration."),
  "royal-thread": material("Royal Thread", "legendary", "Royal fibers used to craft defensive chest armor."),
};

export const SUPPLY_ITEMS = Object.fromEntries([
  ["emergency-treat", "Emergency Treat", "common", "Start your next dungeon with one additional potion."],
  ["hunters-catnip", "Hunter's Catnip", "uncommon", "Gain +5 percentage points accuracy for your next dungeon, capped at 100%."],
  ["padded-paw-charm", "Padded Paw Charm", "rare", "Start your next dungeon with an extra shield worth 10% of maximum HP."],
].map(([id,name,rarity,description]) => [id, {
  name, type: "consumable", slot: null, stats: {}, stat: 0, price: 0,
  purchasable: false, sellable: false, salvageable: false, source: "crafting",
  description, use: `Prepare with !prepare ${id}.`, dungeon: { rarity },
}]));

export const craftingConfig = {
  eternalWrath: { attackMultiplier: 1.35, critBonus: 0.05 },
  supplies: {
    "emergency-treat": { potions: 1 },
    "hunters-catnip": { accuracyBonus: 0.05 },
    "padded-paw-charm": { shieldRatio: 0.10 },
  },
  reinforcement: {
    maxLevel: 3, ratePerLevel: 0.03,
    armorHealthPerLevel: 0.03, minimumArmorHealthPerLevel: 1,
    fees: { 1: 25_000, 2: 75_000, 3: 200_000 },
    materialCounts: { 1: 5, 2: 10, 3: 20 },
    rarityFactors: { common: 1, uncommon: 1, rare: 2, epic: 3, legendary: 5, mythic: 8 },
  },
  recipes: {
    "fang-from-shards": { name: "Moonlit Fang", ingredients: [{ itemId: "cosmic-shard", quantity: 20 }], outputItemId: "moonlit-fang", fee: 0 },
    "core-from-shards": { name: "Starforged Core", ingredients: [{ itemId: "cosmic-shard", quantity: 20 }], outputItemId: "starforged-core", fee: 0 },
    "thread-from-shards": { name: "Royal Thread", ingredients: [{ itemId: "cosmic-shard", quantity: 20 }], outputItemId: "royal-thread", fee: 0 },
    "orb-from-shards": { name: "Eternal Cosmic Cat Orb", ingredients: [{ itemId: "cosmic-shard", quantity: 100 }], outputItemId: "eternal-cosmic-cat-orb", fee: 0 },

    "millies-eternal-wrath": {
      name: "Millie's Eternal Wrath", baseItemId: "millies-wrath",
      ingredients: [{ itemId: "millies-wrath", quantity: 1 }, { itemId: "eternal-cosmic-cat-orb", quantity: 1 }],
      outputItemId: "millies-eternal-wrath", fee: 0,
    },
    "emergency-treat": { name: "Emergency Treat", ingredients: [{ itemId: "enchanted-fur", quantity: 10 }, { itemId: "catsteel-scrap", quantity: 5 }], outputItemId: "emergency-treat", fee: 5_000 },
    "hunters-catnip": { name: "Hunter's Catnip", ingredients: [{ itemId: "enchanted-fur", quantity: 15 }, { itemId: "catsteel-scrap", quantity: 10 }], outputItemId: "hunters-catnip", fee: 10_000 },
    "padded-paw-charm": { name: "Padded Paw Charm", ingredients: [{ itemId: "enchanted-fur", quantity: 20 }, { itemId: "catsteel-scrap", quantity: 15 }], outputItemId: "padded-paw-charm", fee: 15_000 },
    "moonfang-katana": { name: "Moonfang Katana", baseItemId: "black-cat-katana", ingredients: [{ itemId: "black-cat-katana", quantity: 1 }, { itemId: "moonlit-fang", quantity: 1 }, { itemId: "catsteel-scrap", quantity: 40 }, { itemId: "enchanted-fur", quantity: 20 }], outputItemId: "moonfang-katana", fee: 100_000 },
    "starforged-cookie-cannon": { name: "Starforged Cookie Cannon", baseItemId: "cookie-cannon", ingredients: [{ itemId: "cookie-cannon", quantity: 1 }, { itemId: "starforged-core", quantity: 1 }, { itemId: "catsteel-scrap", quantity: 80 }, { itemId: "enchanted-fur", quantity: 30 }], outputItemId: "starforged-cookie-cannon", fee: 250_000 },
    "royal-moonwoven-chestplate": { name: "Royal Moonwoven Chestplate", baseItemId: "royal-cat-chestplate", ingredients: [{ itemId: "royal-cat-chestplate", quantity: 1 }, { itemId: "royal-thread", quantity: 1 }, { itemId: "catsteel-scrap", quantity: 60 }, { itemId: "enchanted-fur", quantity: 80 }], outputItemId: "royal-moonwoven-chestplate", fee: 300_000 },
  },
  salvageByRarity: { common: 1, uncommon: 2, rare: 4, epic: 8, legendary: 16, mythic: 32 },
  salvageMaterialByType: { weapon: "catsteel-scrap", armor: "enchanted-fur", accessory: "catsteel-scrap" },
  salvageMaterialBySlot: { off_hand: "catsteel-scrap" },
  // Basis points: 10 / 10,000 = 0.1%. These replace currency-only outcomes.
  materialDrops: {
    easy: [{ itemId: "catsteel-scrap", bps: 1500 }, { itemId: "enchanted-fur", bps: 1500 }],
    normal: [{ itemId: "catsteel-scrap", bps: 1500 }, { itemId: "enchanted-fur", bps: 1500 }, { itemId: "moonlit-fang", bps: 10 }],
    hard: [{ itemId: "catsteel-scrap", bps: 1200 }, { itemId: "enchanted-fur", bps: 1200 }, { itemId: "eternal-cosmic-cat-orb", bps: 10 }, { itemId: "moonlit-fang", bps: 25 }, { itemId: "starforged-core", bps: 25 }, { itemId: "royal-thread", bps: 25 }],
    ultra: [{ itemId: "catsteel-scrap", bps: 1200 }, { itemId: "enchanted-fur", bps: 1200 }, { itemId: "eternal-cosmic-cat-orb", bps: 100 }, { itemId: "moonlit-fang", bps: 50 }, { itemId: "starforged-core", bps: 50 }, { itemId: "royal-thread", bps: 50 }],
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
    ...structuredClone(SUPPLY_ITEMS),
    "millies-eternal-wrath": {
      ...structuredClone(base), name: "Millie's Eternal Wrath", stat: attack,
      stats: { ...base.stats, attack, critChance },
      price: 0, purchasable: false, sellable: false, salvageable: false, source: "crafting",
      description: "Millie's legendary fury awakened by an Eternal Cosmic Cat Orb.",
      use: "Equip to wield Millie's cosmic fury.",
      dungeon: { ...structuredClone(base.dungeon ?? {}), rarity: "mythic", critChance },
    },
  };
  const variants = [
    ["moonfang-katana", "black-cat-katana", "Moonfang Katana", { attack: 1.15 }, "moonfangDrain"],
    ["starforged-cookie-cannon", "cookie-cannon", "Starforged Cookie Cannon", { attack: 1.15 }, "coreVolley"],
    ["royal-moonwoven-chestplate", "royal-cat-chestplate", "Royal Moonwoven Chestplate", { defense: 1.10, health: 1.20 }, null],
  ];
  for (const [id, baseId, name, scales, skill] of variants) {
    const original = catalog[baseId];
    if (!original) continue;
    const stats = { ...original.stats };
    for (const [key, scale] of Object.entries(scales)) stats[key] = Math.round(Number(stats[key] ?? 0) * scale);
    if (skill && !ABILITIES[skill]) throw new Error(`Missing attachment ability: ${skill}`);
    additions[id] = { ...structuredClone(original), name, stats,
      stat: original.type === "weapon" ? stats.attack : stats.defense,
      price: 0, purchasable: false, sellable: false, salvageable: false, source: "crafting",
      description: `An attachment-enhanced version of ${original.name}.`,
      dungeon: { ...structuredClone(original.dungeon ?? {}), rarity: original.dungeon?.rarity === "mythic" ? "mythic" : "legendary",
        ...(skill ? { ability: { ...ABILITIES[skill] } } : { passive: { ...ARMOR_PASSIVES.fortify } }),
      },
    };
  }
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
    const additions = drops.filter(drop => !table.some(row => row.itemId === drop.itemId)).map(drop => {
      const weight = total * drop.bps / 10_000;
      if (!MATERIAL_ITEMS[drop.itemId] || !Number.isSafeInteger(weight) || weight < 1) {
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
