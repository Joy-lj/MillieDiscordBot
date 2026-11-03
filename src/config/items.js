// src/config/items.js
import { ABILITIES } from "../../services/dungeonAbilities.js";
import { withDungeonItems } from "./dungeonLoot.js";

// Missing stats default to zero.
// critChance uses decimals: 0.05 = +5 percentage points.
function equipment({
  name,
  type,
  slot,
  price,
  rarity,
  description,
  stats = {},
  handedness,
  skill,
}) {
  if (skill && !ABILITIES[skill]) {
    throw new Error(`Unknown equipment ability: ${skill}`);
  }

  return {
    name,
    type,
    slot,
    price,
    description,
    purchasable: true,

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
      rarity,
      ...(skill
        ? { ability: { ...ABILITIES[skill] } }
        : {}),
    },
  };
}

export const SHOP_ITEMS = {
  // ─────────────────────────────────────────────
  // WEAPONS: ONE-HANDED MAIN-HANDS
  // ─────────────────────────────────────────────

  feather: equipment({
    name: "Feather Wand",
    type: "weapon",
    slot: "main_hand",
    handedness: 1,
    price: 5_000,
    rarity: "common",
    description:
      "One feather, one string, and Millie's limitless hunting ambition.",
    stats: { attack: 5, speed: 5, critChance: 0.05 },
    skill: "bonk",
  }),

  "yarn-flail": equipment({
    name: "Yarn Flail",
    type: "weapon",
    slot: "main_hand",
    handedness: 1,
    price: 35_000,
    rarity: "uncommon",
    description:
      "A dense yarn ball attached to a handle stolen from a scratching post.",
    stats: { attack: 20, speed: 3, critChance: 0.07 },
    skill: "bonk",
  }),

  "black-cat-katana": equipment({
    name: "Black Cat Katana",
    type: "weapon",
    slot: "main_hand",
    handedness: 1,
    price: 350_000,
    rarity: "rare",
    description:
      "A midnight blade that leaves scratches before its victim hears a purr.",
    stats: { attack: 80, speed: 5, critChance: 0.15 },
    skill: "bleed",
  }),

  "starforged-claws": equipment({
    name: "Starforged Claw",
    type: "weapon",
    slot: "main_hand",
    handedness: 1,
    price: 2_000_000,
    rarity: "legendary",
    description:
      "A single celestial claw forged from the shooting star Millie caught.",
    stats: { attack: 230, speed: 7, critChance: 0.22 },
    skill: "bleed",
  }),

  // ─────────────────────────────────────────────
  // WEAPONS: OFF-HANDS
  // These provide stats rather than active skills.
  // ─────────────────────────────────────────────

  "parrying-claw": equipment({
    name: "Parrying Claw",
    type: "weapon",
    slot: "off_hand",
    handedness: 1,
    price: 60_000,
    rarity: "uncommon",
    description:
      "A small claw that deflects attacks and scratches the furniture.",
    stats: { attack: 12, health: 5, speed: 1 },
  }),

  "scratching-post-shield": equipment({
    name: "Scratching Post Shield",
    type: "armor",
    slot: "off_hand",
    handedness: 1,
    price: 60_000,
    rarity: "uncommon",
    description:
      "A wooden shield wrapped in battle-tested scratching rope.",
    stats: {
      defense: 12,
      health: 20,
      speed: -2,
    },
  }),

  // ─────────────────────────────────────────────
  // WEAPONS: TWO-HANDED MAIN-HANDS
  // These require the off-hand slot to be empty.
  // ─────────────────────────────────────────────

  "cookie-cannon": equipment({
    name: "Cookie Cannon",
    type: "weapon",
    slot: "main_hand",
    handedness: 2,
    price: 750_000,
    rarity: "epic",
    description:
      "A heavy cannon loaded with cookies baked far beyond their safe crunch.",
    stats: { attack: 150, speed: -4, critChance: 0.12 },
    skill: "barrage",
  }),

  "millies-wrath": equipment({
    name: "Millie's Wrath",
    type: "weapon",
    slot: "main_hand",
    handedness: 2,
    price: 4_000_000,
    rarity: "mythic",
    description:
      "The queen's legendary weapon, awakened when dinner is one minute late.",
    stats: { attack: 400, speed: 0, critChance: 0.25 },
    skill: "barrage",
  }),

  // ─────────────────────────────────────────────
  // TORSOS
  // ─────────────────────────────────────────────

  "padded-coat": equipment({
    name: "Padded Kitten Coat",
    type: "armor",
    slot: "torso",
    price: 10_000,
    rarity: "common",
    description:
      "A cozy coat with a tail opening and pockets full of emergency treats.",
    stats: { defense: 4, health: 15, speed: 1 },
  }),

  "iron-tabby-mail": equipment({
    name: "Iron Tabby Mail",
    type: "armor",
    slot: "torso",
    price: 65_000,
    rarity: "uncommon",
    description:
      "Iron rings arranged in the stripes of a particularly stubborn tabby.",
    stats: { defense: 12, health: 40, speed: -1 },
  }),

  "rune-lynx-plate": equipment({
    name: "Rune Lynx Plate",
    type: "armor",
    slot: "torso",
    price: 300_000,
    rarity: "rare",
    description:
      "Runic plate armor shaped after the guardians of the mountain dens.",
    stats: { defense: 28, health: 100, speed: -3 },
  }),

  "starforged-plate": equipment({
    name: "Starforged Plate",
    type: "armor",
    slot: "torso",
    price: 1_500_000,
    rarity: "legendary",
    description:
      "Meteoric plates polished until Millie can admire herself in each one.",
    stats: { defense: 60, health: 210, speed: -2 },
  }),

  "royal-cat-chestplate": equipment({
    name: "Royal Cat Chestplate",
    type: "armor",
    slot: "torso",
    price: 2_750_000,
    rarity: "mythic",
    description:
      "The queen's golden chestplate, complete with a tiny royal bell.",
    stats: { defense: 110, health: 320, speed: -3 },
  }),

  // ─────────────────────────────────────────────
  // LEGS
  // ─────────────────────────────────────────────

  "padded-paw-pants": equipment({
    name: "Padded Paw Pants",
    type: "armor",
    slot: "legs",
    price: 7_500,
    rarity: "common",
    description:
      "Soft padded trousers made for adventurous paws and awkward landings.",
    stats: { defense: 3, health: 10, speed: 1 },
  }),

  "iron-tabby-tassets": equipment({
    name: "Iron Tabby Tassets",
    type: "armor",
    slot: "legs",
    price: 45_000,
    rarity: "uncommon",
    description:
      "Striped iron leg guards that rattle during unsuccessful sneaking.",
    stats: { defense: 8, health: 30, speed: -1 },
  }),

  "rune-pawguards": equipment({
    name: "Rune Pawguards",
    type: "armor",
    slot: "legs",
    price: 200_000,
    rarity: "rare",
    description:
      "Glowing paw runes protect the wearer through every reckless pounce.",
    stats: { defense: 18, health: 75, speed: -2 },
  }),

  "starforged-platelegs": equipment({
    name: "Starforged Platelegs",
    type: "armor",
    slot: "legs",
    price: 1_000_000,
    rarity: "legendary",
    description:
      "Celestial leg armor that leaves faint constellations in each footprint.",
    stats: { defense: 32, health: 150, speed: 1 },
  }),

  "royal-pride-platelegs": equipment({
    name: "Royal Pride Platelegs",
    type: "armor",
    slot: "legs",
    price: 2_750_000,
    rarity: "mythic",
    description:
      "Golden platelegs reserved for the guardian of Millie's royal food bowl.",
    stats: { defense: 45, health: 230, speed: -1 },
  }),

  // ─────────────────────────────────────────────
  // HELMETS
  // ─────────────────────────────────────────────

  "woolen-kitten-hood": equipment({
    name: "Woolen Kitten Hood",
    type: "armor",
    slot: "head",
    price: 5_000,
    rarity: "common",
    description:
      "A knitted hood with tiny ears for Millie's earliest adventures.",
    stats: { defense: 2, health: 8, speed: 1 },
  }),

  "iron-tabby-helm": equipment({
    name: "Iron Tabby Helm",
    type: "armor",
    slot: "head",
    price: 30_000,
    rarity: "uncommon",
    description:
      "A sturdy iron helmet with reinforced ear holes.",
    stats: { defense: 5, health: 20 },
  }),

  "rune-lynx-helm": equipment({
    name: "Rune Lynx Helm",
    type: "armor",
    slot: "head",
    price: 140_000,
    rarity: "rare",
    description:
      "A rune helmet crowned with the pointed ears of a mountain lynx.",
    stats: { defense: 12, health: 50, speed: -1 },
  }),

  "starforged-earguard": equipment({
    name: "Starforged Earguard",
    type: "armor",
    slot: "head",
    price: 550_000,
    rarity: "legendary",
    description:
      "A celestial helm that protects even the most sensitive royal ears.",
    stats: { defense: 21, health: 100, speed: 1 },
  }),

  "millies-royal-crown": equipment({
    name: "Millie's Royal Crown",
    type: "armor",
    slot: "head",
    price: 2_500_000,
    rarity: "mythic",
    description:
      "An emerald-eyed crown that makes every cardboard box feel like a throne.",
    stats: { defense: 30, health: 160, speed: 2 },
  }),

  // ─────────────────────────────────────────────
  // RINGS
  // ─────────────────────────────────────────────

  "copper-paw-ring": equipment({
    name: "Copper Paw Ring",
    type: "accessory",
    slot: "ring",
    price: 15_000,
    rarity: "common",
    description:
      "A copper band stamped with Millie's first official pawprint.",
    stats: { attack: 1, defense: 2, health: 5 },
  }),

  "catnip-signet": equipment({
    name: "Catnip Signet",
    type: "accessory",
    slot: "ring",
    price: 100_000,
    rarity: "uncommon",
    description:
      "A tiny signet with an irresistible secret compartment.",
    stats: {
      attack: 3,
      defense: 5,
      health: 12,
      speed: 1,
      critChance: 0.01,
    },
  }),

  "moonlit-hunter-ring": equipment({
    name: "Moonlit Hunter Ring",
    type: "accessory",
    slot: "ring",
    price: 450_000,
    rarity: "epic",
    description:
      "A silver ring worn by hunters who patrol the windowsill after dark.",
    stats: {
      attack: 5,
      defense: 9,
      health: 25,
      speed: 2,
      critChance: 0.02,
    },
  }),

  "ring-of-nine-lives": equipment({
    name: "Ring of Nine Lives",
    type: "accessory",
    slot: "ring",
    price: 1_500_000,
    rarity: "mythic",
    description:
      "Nine tiny gems honor the queen's talent for surviving bad decisions.",
    stats: {
      attack: 10,
      defense: 18,
      health: 50,
      speed: 4,
      critChance: 0.06,
    },
  }),

  // ─────────────────────────────────────────────
  // NECKLACES
  // ─────────────────────────────────────────────

  "tin-bell-collar": equipment({
    name: "Tin Bell Collar",
    type: "accessory",
    slot: "neck",
    price: 20_000,
    rarity: "common",
    description:
      "A cheerful collar that announces every failed attempt at stealth.",
    stats: { attack: 1, defense: 3, health: 8 },
  }),

  "silver-whisker-pendant": equipment({
    name: "Silver Whisker Pendant",
    type: "accessory",
    slot: "neck",
    price: 125_000,
    rarity: "uncommon",
    description:
      "A silver pendant shaped around one perfectly preserved royal whisker.",
    stats: { attack: 4, defense: 8, health: 25, speed: 1 },
  }),

  "moonfang-amulet": equipment({
    name: "Moonfang Amulet",
    type: "accessory",
    slot: "neck",
    price: 600_000,
    rarity: "epic",
    description:
      "An enchanted fang that glows whenever dinner is approaching.",
    stats: {
      attack: 7,
      defense: 15,
      health: 55,
      speed: 2,
      critChance: 0.01,
    },
  }),

  "millies-royal-bell": equipment({
    name: "Millie's Royal Bell",
    type: "accessory",
    slot: "neck",
    price: 1_800_000,
    rarity: "mythic",
    description:
      "One chime commands the kingdom. Two chimes demand immediate snacks.",
    stats: {
      attack: 12,
      defense: 25,
      health: 100,
      speed: 3,
      critChance: 0.02,
    },
  }),
};

export const SHOP_ITEM_IDS = Object.keys(SHOP_ITEMS);
export const ITEMS = withDungeonItems(SHOP_ITEMS);