// Millie's equipment progression: 20 weapons and 20 armor pieces.
// The eight original IDs stay stable so existing inventories/equipment still work.
// Both ITEM.stat and ITEM.dungeon remain compatible with the current economy.

import { ABILITIES } from "../../services/dungeonAbilities.js";
import { applyRecommendedAbilities } from "../../services/equipmentAbilityAssignments.js";
import { withDungeonItems } from "./dungeonLoot.js";

const WEAPONS = [
  {
    id: "feather", name: "Feather", stat: 5, price: 5_000,
    description: "Millie's first hunting wand: one feather, one string, endless ambition.",
    use: "Distract a foe with an irresistible flutter.",
    speedBonus: 5, critChance: 0.05, skill: "bonk",
  },
  {
    id: "yarn-flail", name: "Yarn Flail", stat: 8, price: 8_500,
    description: "A tightly wound yarn ball tied to a surprisingly sturdy scratching-post handle.",
    use: "Bonk enemies with the world's least cooperative ball of yarn.",
    speedBonus: 4, critChance: 0.06, skill: "bonk",
  },
  {
    id: "rusty-claw", name: "Rusted Alley Claw", stat: 12, price: 15_000,
    description: "An old iron claw recovered from Millie's disputed territory behind the bins.",
    use: "Leave a nasty scratch on anyone invading your alley.",
    speedBonus: 3, critChance: 0.15, skill: "bleed",
  },
  {
    id: "bronze-paw-dagger", name: "Bronze Paw Dagger", stat: 15, price: 22_000,
    description: "A beginner smith's bronze dagger with a paw-shaped pommel.",
    use: "Practice precise strikes before tackling larger prey.",
    speedBonus: 5, critChance: 0.12, skill: "bleed",
  },
  {
    id: "iron-whisker-blade", name: "Iron Whiskerblade", stat: 18, price: 32_000,
    description: "An iron blade balanced by whisker-like fins along its guard.",
    use: "Rake through an enemy's guard with a determined swipe.",
    speedBonus: 2, critChance: 0.08, skill: "break",
  },
  {
    id: "milk-bottle", name: "Shattered Milk Bottle", stat: 20, price: 45_000,
    description: "The tragic remains of a milk delivery Millie investigated far too enthusiastically.",
    use: "Smash through defenses and avenge the spilled milk.",
    speedBonus: 0, critChance: 0.10, skill: "break",
  },
  {
    id: "steel-claw-scimitar", name: "Steel Claw Scimitar", stat: 28, price: 60_000,
    description: "A curved steel blade forged to follow the arc of a cat's swipe.",
    use: "Deliver broad slashes that open gaps in armor.",
    speedBonus: 2, critChance: 0.10, skill: "break",
  },
  {
    id: "black-cat-katana", name: "Black Cat Katana", stat: 38, price: 78_000,
    description: "A dark blade said to appear only when a black cat crosses your path.",
    use: "Strike quickly and leave your opponent nursing fresh scratches.",
    speedBonus: 5, critChance: 0.15, skill: "bleed",
  },
  {
    id: "mithril-fang-saber", name: "Mithril Fang Saber", stat: 50, price: 100_000,
    description: "A light mithril saber shaped like the fang of an ancient hunting cat.",
    use: "Slip past a guard and carve through its weak points.",
    speedBonus: 3, critChance: 0.12, skill: "break",
  },
  {
    id: "adamant-pounce-glaive", name: "Adamant Pounce Glaive", stat: 65, price: 125_000,
    description: "An adamant polearm built for the grandest leap from the highest cat tree.",
    use: "Bring a heavy paw-shaped blade down on enemy armor.",
    speedBonus: 0, critChance: 0.10, skill: "break",
  },
  {
    id: "rune-whisker-scythe", name: "Rune Whisker Scythe", stat: 78, price: 155_000,
    description: "Glowing paw runes trace a scythe whose edge curves like a silver whisker.",
    use: "Sweep through stubborn defenses with a runic rake.",
    speedBonus: -1, critChance: 0.12, skill: "break",
  },
  {
    id: "dragonclaw-talons", name: "Dragonclaw Talons", stat: 90, price: 190_000,
    description: "A pair of crimson talons fitted for a cat who considers dragons oversized lizards.",
    use: "Unleash quick claw strikes that leave lingering wounds.",
    speedBonus: 6, critChance: 0.18, skill: "bleed",
  },
  {
    id: "cookie-cannon", name: "Cookie Cannon", stat: 100, price: 230_000,
    description: "Millie's snack-powered cannon, loaded with dangerously overbaked cookies.",
    use: "Launch a concentrated barrage of crunchy destruction.",
    speedBonus: -3, critChance: 0.10, skill: "barrage",
  },
  {
    id: "shadow-paw-daggers", name: "Shadowpaw Daggers", stat: 112, price: 275_000,
    description: "Twin obsidian daggers carried by the silent hunters beneath the catacombs.",
    use: "Pounce from the shadows and rake a single target.",
    speedBonus: 7, critChance: 0.22, skill: "bleed",
  },
  {
    id: "moonfang-crossbow", name: "Moonfang Crossbow", stat: 125, price: 320_000,
    description: "A silver crossbow strung with moonlit thread and decorated with tiny fang charms.",
    use: "Fire a focused volley of enchanted cookie bolts.",
    speedBonus: 2, critChance: 0.15, skill: "barrage",
  },
  {
    id: "abyssal-yarn-whip", name: "Abyssal Yarn Whip", stat: 140, price: 370_000,
    description: "A strand of living yarn pulled from a place even Millie refuses to nap.",
    use: "Lash your target and spoil its next attack with a distracting snap.",
    speedBonus: 4, critChance: 0.18, skill: "bonk",
  },
  {
    id: "starforged-claws", name: "Starforged Claws", stat: 155, price: 425_000,
    description: "Celestial metal claws made from the shooting star Millie finally caught.",
    use: "Etch bright, lingering claw marks into a powerful foe.",
    speedBonus: 5, critChance: 0.20, skill: "bleed",
  },
  {
    id: "void-purr-staff", name: "Voidpurr Staff", stat: 170, price: 480_000,
    description: "A dark staff that hums with the impossible sound of a cosmic cat purring.",
    use: "Focus void energy into a single devastating cookie blast.",
    speedBonus: 1, critChance: 0.18, skill: "barrage",
  },
  {
    id: "sovereign-catblade", name: "Sovereign Catblade", stat: 185, price: 540_000,
    description: "The royal execution blade of a feline kingdom where all furniture is a throne.",
    use: "Split the strongest guard with a regal, armor-breaking strike.",
    speedBonus: 3, critChance: 0.20, skill: "break",
  },
  {
    id: "millies-wrath", name: "Millie's Wrath", stat: 200, price: 600_000,
    description: "Millie's legendary relic, awakened when dinner is one minute late.",
    use: "Unleash the full cookie-fueled fury of the queen herself.",
    speedBonus: 0, critChance: 0.20, skill: "barrage",
  },
];

const ARMOR = [
  {
    id: "bicycle-helmet", name: "Woolen Kitten Hood", stat: 10, price: 7_500,
    description: "A soft hood with little ears, knitted for Millie's first adventure.",
    use: "Keep curious ears safe from small bumps.", healthBonus: 10, speedBonus: 3,
  },
  {
    id: "cardboard-cuirass", name: "Cardboard Cuirass", stat: 14, price: 11_000,
    description: "A delivery box with leg holes. Millie insists it is a fortified castle.",
    use: "Turn a favorite cardboard box into lightweight protection.", healthBonus: 15, speedBonus: 2,
  },
  {
    id: "quilted-whisker-vest", name: "Quilted Whisker Vest", stat: 18, price: 15_000,
    description: "Patchwork padding stitched from the blanket Millie claimed as her own.",
    use: "Soften incoming hits without weighing down a pounce.", healthBonus: 20, speedBonus: 3,
  },
  {
    id: "padded-coat", name: "Padded coat", stat: 25, price: 20_000,
    description: "A snug padded coat with a tail opening and an unreasonable number of pockets.",
    use: "Cushion falls and protect a young adventurer.", healthBonus: 25, speedBonus: 1,
  },
  {
    id: "bronze-pawplate", name: "Bronze Pawplate", stat: 32, price: 28_000,
    description: "Bronze plates stamped with Millie's official paw of approval.",
    use: "Trade a little freedom of movement for dependable metal protection.", healthBonus: 30, speedBonus: 0,
  },
  {
    id: "iron-tabby-mail", name: "Iron Tabby Mail", stat: 40, price: 38_000,
    description: "Iron rings arranged into the striped pattern of a battle-ready tabby.",
    use: "Protect against claws, blades, and territorial disputes.", healthBonus: 35, speedBonus: -1,
  },
  {
    id: "steel-scratcher-mail", name: "Steel Scratcher Mail", stat: 50, price: 50_000,
    description: "Steel mail tested against the most destructive scratching post in the kingdom.",
    use: "Stand firm through punishing close-range attacks.", healthBonus: 40, speedBonus: -2,
  },
  {
    id: "chainmail-shirt", name: "Mithril Whiskermail", stat: 60, price: 65_000,
    description: "Light mithril links woven as finely as a cat's sensitive whiskers.",
    use: "Stay nimble while shrugging off heavier strikes.", healthBonus: 45, speedBonus: 2,
  },
  {
    id: "black-cat-carapace", name: "Black Cat Carapace", stat: 72, price: 85_000,
    description: "A sleek black shell that disappears against the shadows under the sofa.",
    use: "Keep moving while resisting the dangers of a midnight hunt.", healthBonus: 50, speedBonus: 3,
  },
  {
    id: "adamant-lynx-plate", name: "Adamant Lynx Plate", stat: 85, price: 110_000,
    description: "Heavy adamant armor modeled after a lynx guarding its mountain den.",
    use: "Absorb powerful blows at the cost of some agility.", healthBonus: 54, speedBonus: -3,
  },
  {
    id: "rune-lionguard", name: "Rune Lionguard", stat: 100, price: 140_000,
    description: "A runic breastplate engraved with the lion Millie sees in every mirror.",
    use: "Face hardened dungeon guardians with a formidable defense.", healthBonus: 58, speedBonus: -4,
  },
  {
    id: "dragonhide-purrcoat", name: "Dragonhide Purrcoat", stat: 115, price: 180_000,
    description: "Supple red dragonhide tailored to fit a hunter with impeccable taste.",
    use: "Endure heavy attacks while retaining some mobility.", healthBonus: 62, speedBonus: -2,
  },
  {
    id: "nightstalker-raiment", name: "Nightstalker Raiment", stat: 130, price: 225_000,
    description: "Silent hunter's armor trimmed with the fur of a shadow that escaped Millie.",
    use: "Keep your initiative high without surrendering strong protection.", healthBonus: 65, speedBonus: 4,
  },
  {
    id: "moonwoven-mantle", name: "Moonwoven Mantle", stat: 140, price: 280_000,
    description: "Moonlight spun into a cloak for a cat who patrols the windowsill after dark.",
    use: "Stay quick beneath a protective mantle of silver thread.", healthBonus: 68, speedBonus: 3,
  },
  {
    id: "bulletproof-vest", name: "Runic Guardian Vest", stat: 150, price: 340_000,
    description: "An armored vest bearing ancient wards around Millie's most important nap spot.",
    use: "Brace against the dungeon's hardest hits.", healthBonus: 70, speedBonus: -5,
  },
  {
    id: "spectral-sphinx-robe", name: "Spectral Sphinx Robe", stat: 158, price: 410_000,
    description: "A ghostly robe left by a sphinx whose final riddle was about opening a food tin.",
    use: "Pair strong protection with a larger reserve of health.", healthBonus: 90, speedBonus: 2,
  },
  {
    id: "abyssal-panther-plate", name: "Abyssal Panther Plate", stat: 165, price: 490_000,
    description: "Dark plate armor that seems to breathe with a sleeping panther's rhythm.",
    use: "Weather repeated punishment through defense and endurance.", healthBonus: 115, speedBonus: -4,
  },
  {
    id: "starforged-whiskerplate", name: "Starforged Whiskerplate", stat: 172, price: 570_000,
    description: "Meteoric plates polished until Millie could admire herself in every segment.",
    use: "Carry celestial protection into long boss encounters.", healthBonus: 140, speedBonus: -3,
  },
  {
    id: "void-cat-regalia", name: "Void Cat Regalia", stat: 179, price: 660_000,
    description: "Royal garments woven from the darkness inside a box nobody has opened.",
    use: "Combine substantial health with protection that stays light on the paws.", healthBonus: 170, speedBonus: 1,
  },
  {
    id: "royal-cat-armor", name: "Royal Cat Armor", stat: 185, price: 750_000,
    description: "Millie's supreme golden armor, crowned with emerald eyes and a tiny royal bell.",
    use: "Withstand enormous punishment as the guardian of Millie's kingdom.", healthBonus: 200, speedBonus: -5,
  },
];

function rarityForTier(tier) {
  if (tier <= 4) return "common";
  if (tier <= 8) return "uncommon";
  if (tier <= 12) return "rare";
  if (tier <= 16) return "epic";
  if (tier <= 18) return "legendary";
  return "mythic";
}

const catalog = [
  ...WEAPONS.map((item, index) => ({ ...item, type: "weapon", tier: index + 1 })),
  ...ARMOR.map((item, index) => ({ ...item, type: "armor", tier: index + 1 })),
];
if (new Set(catalog.map((item) => item.id)).size !== catalog.length) {
  throw new Error("Equipment IDs must be unique.");
}

export const BASE_ITEMS = Object.fromEntries(catalog.map((item) => [item.id, {
  name: item.name,
  type: item.type,
  stat: item.stat,
  price: item.price,
  description: item.description,
  use: item.use,
}]));

export const DUNGEON_STATS = Object.fromEntries(catalog.map((item) => [item.id, {
  tier: item.tier,
  rarity: rarityForTier(item.tier),
  speedBonus: item.speedBonus,
  ...(item.type === "weapon" ? {
    critChance: item.critChance,
    ability: { ...ABILITIES[item.skill] },
  } : {
    healthBonus: item.healthBonus,
  }),
}]));

export const ITEMS = withDungeonItems(
  applyRecommendedAbilities(
    Object.fromEntries(
      Object.entries(BASE_ITEMS).map(([id, item]) => [
        id,
        { ...item, dungeon: DUNGEON_STATS[id] ?? {} },
      ])
    )
  )
);