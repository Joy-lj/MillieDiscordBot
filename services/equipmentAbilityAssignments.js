import { ABILITIES, ARMOR_PASSIVES } from "./dungeonAbilities.js";

// Match DISPLAY NAMES, not IDs. Your renamed inventory IDs are left intact.
export const WEAPON_RECOMMENDATIONS = {
  "Feather Teaser": "bonk",
  "Yarn Flail": "bonk",
  "Rusted Alley Claw": "bleed",
  "Bronze Paw Dagger": "pounce",
  "Iron Whiskerblade": "break",
  "Shattered Milk Bottle": "break",
  "Steel Claw Scimitar": "frenzy",
  "Black Cat Katana": "pounce",
  "Mithril Fang Saber": "siphon",
  "Adamant Pounce Glaive": "break",
  "Rune Whisker Scythe": "roar",
  "Dragonclaw Talons": "bleed",
  "Cookie Cannon": "barrage",
  "Shadowpaw Daggers": "siphon",
  "Moonfang Crossbow": "volley",
  "Abyssal Yarn Whip": "ward",
  "Starforged Claws": "frenzy",
  "Voidpurr Staff": "purr",
  "Sovereign Catblade": "roar",
  "Millie's Wrath": "pawfall",
};

export const ARMOR_RECOMMENDATIONS = {
  "Woolen Kitten Hood": "regen",
  "Cardboard Cuirass": "padding",
  "Quilted Whisker Vest": "regen",
  "Padded Purrcoat": "padding",
  "Bronze Pawplate": "fortify",
  "Iron Tabby Mail": "fortify",
  "Steel Scratcher Mail": "thorns",
  "Mithril Whiskermail": "hunter",
  "Black Cat Carapace": "hunter",
  "Adamant Lynx Plate": "thorns",
  "Rune Lionguard": "fortify",
  "Dragonhide Purrcoat": "thorns",
  "Nightstalker Raiment": "hunter",
  "Moonwoven Mantle": "regen",
  "Runic Guardian Vest": "fortify",
  "Spectral Sphinx Robe": "regen",
  "Abyssal Panther Plate": "thorns",
  "Starforged Whiskerplate": "padding",
  "Void Cat Regalia": "regen",
  "Royal Cat Armor": "nineLives",
};

const normalize = (value) => String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export function applyRecommendedAbilities(items) {
  const weapons = new Map(Object.entries(WEAPON_RECOMMENDATIONS).map(([name, key]) => [normalize(name), key]));
  const armor = new Map(Object.entries(ARMOR_RECOMMENDATIONS).map(([name, key]) => [normalize(name), key]));
  return Object.fromEntries(Object.entries(items).map(([id, item]) => {
    const key = (item.type === "weapon" ? weapons : armor).get(normalize(item.name));
    if (!key) return [id, item];
    const dungeon = { ...item.dungeon };
    if (item.type === "weapon") dungeon.ability = { ...ABILITIES[key] };
    else if (item.type === "armor") dungeon.passive = { ...ARMOR_PASSIVES[key] };
    return [id, { ...item, dungeon }];
  }));
}
