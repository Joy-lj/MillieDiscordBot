import { ABILITIES } from "./dungeonAbilities.js";

// Main-hand specials only. Off-hands contribute stats; armor keeps its passives.
export const WEAPON_SPECIALS = {
  feather: "flutter",
  "yarn-flail": "tangle",
  "black-cat-katana": "doubleSlash",
  "cookie-cannon": "cannonade",
  "starforged-claws": "starFlurry",
  "millies-wrath": "royalFury",
  "tombfang-sabre": "twinFang",
  "cryptclaw-talons": "cryptFeast",
  "abyssal-pawreaper": "abyssalReap",
  "millies-eclipse": "eclipseExecution",
  "millies-eternal-wrath": "eternalFury",
  "moonfang-katana": "moonfangDrain",
  "starforged-cookie-cannon": "coreVolley",
};

export function applyWeaponSpecials(items) {
  const result = { ...items };
  for (const [id, key] of Object.entries(WEAPON_SPECIALS)) {
    const item = result[id];
    if (!item) continue; // Optional/retired loot does not prevent startup.
    if (item.type !== "weapon" || item.slot !== "main_hand") {
      throw new Error(`Special attack requires a main-hand weapon: ${id}`);
    }
    if (!ABILITIES[key]) throw new Error(`Missing ability: ${key}`);
    result[id] = { ...item, dungeon: { ...item.dungeon, ability: { ...ABILITIES[key] } } };
  }
  return result;
}
