import { withMaterialDrops } from "./crafting.js";
import {
  ABILITIES,
  ARMOR_PASSIVES,
} from "../../services/dungeonAbilities.js";

function dungeonItem({
  name,
  type,
  slot,
  price,
  rarity,
  tier,
  description,
  stats,
  handedness,
  skill,
  passive,
}) {
  if (skill && !ABILITIES[skill]) {
    throw new Error(`Unknown dungeon ability: ${skill}`);
  }

  if (passive && !ARMOR_PASSIVES[passive]) {
    throw new Error(`Unknown dungeon passive: ${passive}`);
  }

  return {
    name,
    type,
    slot,

    // Valuation used by your sell logic.
    // This does not make the item available in the shop.
    price,
    purchasable: false,
    source: "dungeon",

    description,

    ...(handedness ? { handedness } : {}),

    stats: {
      attack: 0,
      defense: 0,
      health: 0,
      speed: 0,
      critChance: 0,
      ...stats,
    },

    dungeon: {
      tier,
      rarity,

      ...(skill
        ? { ability: { ...ABILITIES[skill] } }
        : {}),

      ...(passive
        ? { passive: { ...ARMOR_PASSIVES[passive] } }
        : {}),
    },
  };
}

export const DUNGEON_ITEMS = {
  // ─────────────────────────────────────────────
  // RARE
  // ─────────────────────────────────────────────

  "tombfang-sabre": dungeonItem({
    name: "Tombfang Sabre",
    type: "weapon",
    slot: "main_hand",
    handedness: 1,
    price: 450_000,
    tier: 3,
    rarity: "rare",
    description:
      "A curved fang-blade buried beneath Millie's oldest scratching post.",

    stats: {
      attack: 90,
      speed: 4,
      critChance: 0.16,
    },

    skill: "bleed",
  }),

  "cryptkeeper-purrplate": dungeonItem({
    name: "Cryptkeeper Purrplate",
    type: "armor",
    slot: "torso",
    price: 400_000,
    tier: 3,
    rarity: "rare",
    description:
      "Ancient pawplate that guards its wearer like a fiercely territorial cat.",

    stats: {
      defense: 32,
      health: 110,
      speed: -2,
    },

    passive: "fortify",
  }),

  // ─────────────────────────────────────────────
  // EPIC
  // ─────────────────────────────────────────────

  "cryptclaw-talons": dungeonItem({
    name: "Cryptclaw Talons",
    type: "weapon",
    slot: "main_hand",
    handedness: 1,
    price: 1_100_000,
    tier: 4,
    rarity: "epic",
    description:
      "Spectral claws that steal a little life with every Fang Feast.",

    stats: {
      attack: 165,
      speed: 6,
      critChance: 0.20,
    },

    skill: "siphon",
  }),

  "spectral-tabby-shroud": dungeonItem({
    name: "Spectral Tabby Shroud",
    type: "armor",
    slot: "torso",
    price: 850_000,
    tier: 4,
    rarity: "epic",
    description:
      "A ghostly tabby mantle stitched from dreams of endless naps.",

    stats: {
      defense: 44,
      health: 180,
      speed: 3,
    },

    passive: "regen",
  }),

  // ─────────────────────────────────────────────
  // LEGENDARY
  // ─────────────────────────────────────────────

  "abyssal-pawreaper": dungeonItem({
    name: "Abyssal Pawreaper",
    type: "weapon",
    slot: "main_hand",
    handedness: 2,
    price: 2_500_000,
    tier: 5,
    rarity: "legendary",
    description:
      "A moon-dark reaper that cuts through the toughest dungeon shells.",

    stats: {
      attack: 260,
      speed: 2,
      critChance: 0.22,
    },

    skill: "volley",
  }),

  "abyssal-maneplate": dungeonItem({
    name: "Abyssal Maneplate",
    type: "armor",
    slot: "torso",
    price: 1_800_000,
    tier: 5,
    rarity: "legendary",
    description:
      "Jagged plates rise like an angry cat's mane when struck.",

    stats: {
      defense: 60,
      health: 270,
      speed: -3,
    },

    passive: "thorns",
  }),

  // ─────────────────────────────────────────────
  // MYTHIC
  // ─────────────────────────────────────────────

  "millies-eclipse": dungeonItem({
    name: "Millie's Eclipse",
    type: "weapon",
    slot: "main_hand",
    handedness: 2,
    price: 6_000_000,
    tier: 6,
    rarity: "mythic",
    description:
      "Millie's forbidden final pounce, forged where moonlight disappears.",

    stats: {
      attack: 420,
      speed: 0,
      critChance: 0.25,
    },

    skill: "pawfall",
  }),

  "eclipse-cat-regalia": dungeonItem({
    name: "Eclipse Cat Regalia",
    type: "armor",
    slot: "torso",
    price: 3_500_000,
    tier: 6,
    rarity: "mythic",
    description:
      "The lost regalia of a feline sovereign who refused her final death.",

    stats: {
      defense: 170,
      health: 360,
      speed: -4,
    },

    passive: "nineLives",
  }),
};

// Each difficulty totals 10,000 weight.
// Each player receives one independent roll per full clear.
// null = no equipment drop; normal currency rewards still apply.
export const dungeonLootTables = {
  easy: [
    { itemId: null, weight: 9800 },

    { itemId: "tombfang-sabre", weight: 100 },
    { itemId: "cryptkeeper-purrplate", weight: 100 },
  ],

  normal: [
    { itemId: null, weight: 9600 },

    { itemId: "tombfang-sabre", weight: 150 },
    { itemId: "cryptkeeper-purrplate", weight: 150 },

    { itemId: "cryptclaw-talons", weight: 50 },
    { itemId: "spectral-tabby-shroud", weight: 50 },
  ],

  hard: [
    { itemId: null, weight: 9400 },

    { itemId: "tombfang-sabre", weight: 150 },
    { itemId: "cryptkeeper-purrplate", weight: 150 },

    { itemId: "cryptclaw-talons", weight: 100 },
    { itemId: "spectral-tabby-shroud", weight: 100 },

    { itemId: "abyssal-pawreaper", weight: 40 },
    { itemId: "abyssal-maneplate", weight: 40 },

    { itemId: "millies-eclipse", weight: 10 },
    { itemId: "eclipse-cat-regalia", weight: 10 },
  ],
  // Total weight: 10,000.
  ultra: [
    // Currency reward only — no additional item.
    { itemId: null, weight: 6300 }, // 63%

    // Rare equipment
    { itemId: "tombfang-sabre", weight: 300 },          // 3%
    { itemId: "cryptkeeper-purrplate", weight: 300 },   // 3%

    // Epic equipment
    { itemId: "cryptclaw-talons", weight: 200 },        // 2%
    { itemId: "spectral-tabby-shroud", weight: 200 },   // 2%

    // Legendary equipment
    { itemId: "abyssal-pawreaper", weight: 80 },        // 0.8%
    { itemId: "abyssal-maneplate", weight: 80 },        // 0.8%

    // Mythic equipment
    { itemId: "millies-eclipse", weight: 20 },          // 0.2%
    { itemId: "eclipse-cat-regalia", weight: 20 },      // 0.2%

    // Crafting materials
    { itemId: "catsteel-scrap", weight: 1200 },         // 12%
    { itemId: "enchanted-fur", weight: 1200 },          // 12%
    { itemId: "eternal-cosmic-cat-orb", weight: 100 },  // 1%
  ],
};

export function withDungeonItems(items) {
  for (const id of Object.keys(DUNGEON_ITEMS)) {
    if (Object.hasOwn(items, id)) {
      throw new Error(`Dungeon item ID already exists: ${id}`);
    }
  }

  return {
    ...items,
    ...structuredClone(DUNGEON_ITEMS),
  };
}
// MILLIE_MATERIAL_DROPS_V1
Object.assign(dungeonLootTables, withMaterialDrops(dungeonLootTables));