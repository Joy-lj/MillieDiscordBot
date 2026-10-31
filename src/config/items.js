import {
  ABILITIES,
  ARMOR_PASSIVES,
} from "../../services/dungeonAbilities.js";

import {
  applyRecommendedAbilities,
} from "../../services/equipmentAbilityAssignments.js";

import { withDungeonItems } from "./dungeonLoot.js";

const WEAPONS = [
  {
    id: "feather",
    name: "Feather",
    stat: 5,
    price: 5_000,
    description: "Millie's first hunting wand: one feather, one string, endless ambition.",
    use: "Distract a foe with an irresistible flutter.",
    speedBonus: 5,
    critChance: 0.05,
    skill: "bonk",
  },
  {
    id: "yarn-flail",
    name: "Yarn Flail",
    stat: 12,
    price: 20_000,
    description: "A tightly wound yarn ball attached to a scratching-post handle.",
    use: "Bonk enemies with an uncooperative ball of yarn.",
    speedBonus: 4,
    critChance: 0.07,
    skill: "bonk",
  },
  {
    id: "milk-bottle",
    name: "Shattered Milk Bottle",
    stat: 24,
    price: 50_000,
    description: "The remains of a milk delivery Millie investigated too enthusiastically.",
    use: "Smash through defenses and avenge the spilled milk.",
    speedBonus: 0,
    critChance: 0.10,
    skill: "break",
  },
  {
    id: "black-cat-katana",
    name: "Black Cat Katana",
    stat: 40,
    price: 100_000,
    description: "A dark blade that appears when a black cat crosses your path.",
    use: "Pounce before your opponent can react.",
    speedBonus: 5,
    critChance: 0.15,
    skill: "pounce",
  },
  {
    id: "mithril-fang-saber",
    name: "Mithril Fang Saber",
    stat: 60,
    price: 180_000,
    description: "A light mithril saber shaped like an ancient hunting cat's fang.",
    use: "Drain an enemy's strength with Fang Feast.",
    speedBonus: 3,
    critChance: 0.15,
    skill: "siphon",
  },
  {
    id: "rune-whisker-scythe",
    name: "Rune Whisker Scythe",
    stat: 85,
    price: 300_000,
    description: "Glowing paw runes trace an edge curved like a silver whisker.",
    use: "Unleash a royal roar that weakens enemy attacks.",
    speedBonus: -1,
    critChance: 0.17,
    skill: "roar",
  },
  {
    id: "cookie-cannon",
    name: "Cookie Cannon",
    stat: 115,
    price: 500_000,
    description: "Millie's snack-powered cannon, loaded with overbaked cookies.",
    use: "Launch a barrage of crunchy destruction.",
    speedBonus: -3,
    critChance: 0.15,
    skill: "barrage",
  },
  {
    id: "shadow-paw-daggers",
    name: "Shadowpaw Daggers",
    stat: 150,
    price: 800_000,
    description: "Twin obsidian daggers carried by hunters beneath the catacombs.",
    use: "Strike from the shadows and steal back health.",
    speedBonus: 7,
    critChance: 0.25,
    skill: "siphon",
  },
  {
    id: "moonfang-crossbow",
    name: "Moonfang Crossbow",
    stat: 190,
    price: 1_200_000,
    description: "A silver crossbow strung with moonlit thread and fang charms.",
    use: "Fire a defense-piercing Fishbone Volley.",
    speedBonus: 2,
    critChance: 0.23,
    skill: "volley",
  },
  {
    id: "starforged-claws",
    name: "Starforged Claws",
    stat: 240,
    price: 1_800_000,
    description: "Celestial claws forged from the shooting star Millie finally caught.",
    use: "Enter a powerful Catnip Frenzy.",
    speedBonus: 5,
    critChance: 0.27,
    skill: "frenzy",
  },
  {
    id: "void-purr-staff",
    name: "Voidpurr Staff",
    stat: 300,
    price: 2_700_000,
    description: "A dark staff humming with the sound of a cosmic cat purring.",
    use: "Heal yourself or a wounded teammate with Soothing Purr.",
    speedBonus: 1,
    critChance: 0.28,
    skill: "purr",
  },
  {
    id: "millies-wrath",
    name: "Millie's Wrath",
    stat: 380,
    price: 4_000_000,
    description: "Millie's legendary relic, awakened when dinner is one minute late.",
    use: "Unleash Celestial Pawfall upon your enemy.",
    speedBonus: 0,
    critChance: 0.30,
    skill: "pawfall",
  },
];

const ARMOR = [
  {
    id: "bicycle-helmet",
    name: "Woolen Kitten Hood",
    stat: 10,
    price: 7_500,
    description: "A soft hood with little ears, knitted for Millie's first adventure.",
    use: "Protect curious ears from small bumps.",
    healthBonus: 10,
    speedBonus: 3,
    passive: "regen",
  },
  {
    id: "padded-coat",
    name: "Padded coat",
    stat: 22,
    price: 25_000,
    description: "A snug padded coat with a tail opening and plenty of pockets.",
    use: "Cushion falls and absorb the first blows.",
    healthBonus: 25,
    speedBonus: 1,
    passive: "padding",
  },
  {
    id: "iron-tabby-mail",
    name: "Iron Tabby Mail",
    stat: 38,
    price: 60_000,
    description: "Iron rings arranged into the stripes of a battle-ready tabby.",
    use: "Reduce damage from territorial disputes.",
    healthBonus: 45,
    speedBonus: -1,
    passive: "fortify",
  },
  {
    id: "steel-scratcher-mail",
    name: "Steel Scratcher Mail",
    stat: 58,
    price: 120_000,
    description: "Steel mail tested against the kingdom's toughest scratching post.",
    use: "Reflect a portion of incoming damage.",
    healthBonus: 70,
    speedBonus: -2,
    passive: "thorns",
  },
  {
    id: "rune-lynx-plate",
    name: "Rune Lynx Plate",
    stat: 82,
    price: 220_000,
    description: "Heavy rune armor modeled after a lynx guarding its mountain den.",
    use: "Punish enemies that strike your armor.",
    healthBonus: 105,
    speedBonus: -3,
    passive: "thorns",
  },
  {
    id: "dragonhide-purrcoat",
    name: "Dragonhide Purrcoat",
    stat: 108,
    price: 375_000,
    description: "Supple red dragonhide tailored for a hunter with impeccable taste.",
    use: "Endure heavy attacks and retaliate.",
    healthBonus: 150,
    speedBonus: -2,
    passive: "thorns",
  },
  {
    id: "nightstalker-raiment",
    name: "Nightstalker Raiment",
    stat: 132,
    price: 625_000,
    description: "Silent armor trimmed with the fur of a shadow that escaped Millie.",
    use: "Improve your hunting instincts and critical chance.",
    healthBonus: 210,
    speedBonus: 4,
    passive: "hunter",
  },
  {
    id: "moonwoven-mantle",
    name: "Moonwoven Mantle",
    stat: 150,
    price: 1_000_000,
    description: "Moonlight spun into a cloak for Millie's nightly windowsill patrol.",
    use: "Recover health beneath a protective silver mantle.",
    healthBonus: 285,
    speedBonus: 3,
    passive: "regen",
  },
  {
    id: "spectral-sphinx-robe",
    name: "Spectral Sphinx Robe",
    stat: 165,
    price: 1_500_000,
    description: "A ghostly robe left by a sphinx obsessed with opening food tins.",
    use: "Sustain yourself through longer battles.",
    healthBonus: 380,
    speedBonus: 2,
    passive: "regen",
  },
  {
    id: "starforged-whiskerplate",
    name: "Starforged Whiskerplate",
    stat: 175,
    price: 2_250_000,
    description: "Meteoric plates polished so Millie can admire every reflection.",
    use: "Enter battle protected by a celestial shield.",
    healthBonus: 500,
    speedBonus: -3,
    passive: "padding",
  },
  {
    id: "void-cat-regalia",
    name: "Void Cat Regalia",
    stat: 182,
    price: 3_300_000,
    description: "Royal garments woven from the darkness inside an unopened box.",
    use: "Regenerate health through prolonged encounters.",
    healthBonus: 650,
    speedBonus: 1,
    passive: "regen",
  },
  {
    id: "royal-cat-armor",
    name: "Royal Cat Armor",
    stat: 185,
    price: 5_000_000,
    description: "Millie's golden armor, crowned with emerald eyes and a royal bell.",
    use: "Survive one otherwise lethal enemy attack per dungeon.",
    healthBonus: 850,
    speedBonus: -5,
    passive: "nineLives",
  },
];

export const SHOP_ITEM_IDS = [
  ...WEAPONS.map((item) => item.id),
  ...ARMOR.map((item) => item.id),
];

function rarityForTier(tier) {
  if (tier <= 2) return "common";
  if (tier <= 4) return "uncommon";
  if (tier <= 6) return "rare";
  if (tier <= 8) return "epic";
  if (tier <= 10) return "legendary";
  return "mythic";
}

const catalog = [
  ...WEAPONS.map((item, index) => ({
    ...item,
    type: "weapon",
    tier: index + 1,
  })),
  ...ARMOR.map((item, index) => ({
    ...item,
    type: "armor",
    tier: index + 1,
  })),
];

if (new Set(catalog.map((item) => item.id)).size !== catalog.length) {
  throw new Error("Equipment IDs must be unique.");
}

for (const item of catalog) {
  if (item.type === "weapon" && !ABILITIES[item.skill]) {
    throw new Error(`Unknown ability for ${item.id}: ${item.skill}`);
  }

  if (item.type === "armor" && !ARMOR_PASSIVES[item.passive]) {
    throw new Error(`Unknown passive for ${item.id}: ${item.passive}`);
  }
}

export const BASE_ITEMS = Object.fromEntries(
  catalog.map((item) => [
    item.id,
    {
      name: item.name,
      type: item.type,
      stat: item.stat,
      price: item.price,
      description: item.description,
      use: item.use,
      purchasable: true,
    },
  ])
);

export const DUNGEON_STATS = Object.fromEntries(
  catalog.map((item) => [
    item.id,
    {
      tier: item.tier,
      rarity: rarityForTier(item.tier),
      speedBonus: item.speedBonus,
      ...(item.type === "weapon"
        ? {
          critChance: item.critChance,
          ability: { ...ABILITIES[item.skill] },
        }
        : {
          healthBonus: item.healthBonus,
          passive: { ...ARMOR_PASSIVES[item.passive] },
        }),
    },
  ])
);

export const ITEMS = withDungeonItems(
  applyRecommendedAbilities(
    Object.fromEntries(
      Object.entries(BASE_ITEMS).map(([id, item]) => [
        id,
        {
          ...item,
          dungeon: DUNGEON_STATS[id],
        },
      ])
    )
  )
);