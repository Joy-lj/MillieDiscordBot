import { ABILITIES, ARMOR_PASSIVES } from "../../services/dungeonAbilities.js";

// price is a valuation for existing sell logic (currently 50%), NOT a shop price.
const weapon = (name, stat, price, tier, rarity, skill, speed, crit, description) => ({
  name, type: "weapon", stat, price, purchasable: false, source: "dungeon",
  description, use: "Equip with !equip <item-id> <serial-number>.",
  dungeon: { tier, rarity, speedBonus: speed, critChance: crit, ability: { ...ABILITIES[skill] } },
});
const armor = (name, stat, health, price, tier, rarity, passive, speed, description) => ({
  name, type: "armor", stat, price, purchasable: false, source: "dungeon",
  description, use: "Equip with !equip <item-id> <serial-number>.",
  dungeon: { tier, rarity, healthBonus: health, speedBonus: speed, passive: { ...ARMOR_PASSIVES[passive] } },
});

export const DUNGEON_ITEMS = {
  "tombfang-sabre": weapon("Tombfang Sabre", 82, 175_000, 3, "rare", "bleed", 4, 0.15,
    "A curved fang-blade buried beneath Millie's oldest scratching post."),
  "cryptkeeper-purrplate": armor("Cryptkeeper Purrplate", 90, 58, 125_000, 3, "rare", "fortify", -2,
    "Ancient pawplate that guards its wearer like a fiercely territorial cat."),
  "cryptclaw-talons": weapon("Cryptclaw Talons", 115, 285_000, 4, "epic", "siphon", 6, 0.18,
    "Spectral claws that steal a little life with every Fang Feast."),
  "spectral-tabby-shroud": armor("Spectral Tabby Shroud", 125, 80, 240_000, 4, "epic", "regen", 3,
    "A ghostly tabby mantle stitched from dreams of endless naps."),
  "abyssal-pawreaper": weapon("Abyssal Pawreaper", 160, 450_000, 5, "legendary", "volley", 2, 0.18,
    "A moon-dark reaper that cuts through the toughest dungeon shells."),
  "abyssal-maneplate": armor("Abyssal Maneplate", 165, 125, 515_000, 5, "legendary", "thorns", -3,
    "Jagged plates rise like an angry cat's mane when struck."),
  "millies-eclipse": weapon("Millie's Eclipse", 210, 800_000, 6, "mythic", "pawfall", 0, 0.20,
    "Millie's forbidden final pounce, forged where moonlight disappears."),
  "eclipse-cat-regalia": armor("Eclipse Cat Regalia", 190, 210, 900_000, 6, "mythic", "nineLives", -4,
    "The lost regalia of a feline sovereign who refused her final death."),
};

// Exactly 10,000 weight per difficulty: weight 10 = 0.1% per player's clear.
// null means currency only. Each player rolls independently, once per full clear.
// Solo and co-op have identical loot odds; existing currency scaling is unchanged.
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
};

export function withDungeonItems(items) {
  for (const id of Object.keys(DUNGEON_ITEMS)) {
    if (Object.hasOwn(items, id)) throw new Error(`Dungeon item ID already exists: ${id}`);
  }
  return { ...items, ...structuredClone(DUNGEON_ITEMS) };
}
