import { craftingConfig } from "../src/config/crafting.js";

export function upgradeLevel(value = 0) {
  const level = Number(value);
  if (!Number.isSafeInteger(level) || level < 0 || level > craftingConfig.reinforcement.maxLevel) throw new Error("Invalid item upgrade level.");
  return level;
}

export function applyItemUpgrade(item, value = 0) {
  if (!item) return null;
  const level = upgradeLevel(value);
  const result = structuredClone(item);
  result.upgradeLevel = level;
  if (!level) return result;
  if (!["weapon", "armor"].includes(item.type)) throw new Error("Only weapons and armor can be reinforced.");
  const key = item.type === "weapon" ? "attack" : "defense";
  const base = Number(item.stats?.[key] ?? item.stat ?? 0);
  const rate = craftingConfig.reinforcement.ratePerLevel;
  if (!Number.isFinite(base) || base < 0 || !Number.isFinite(rate) || rate < 0 || rate > 1) throw new Error("Invalid reinforcement stat.");
  const bonus = base > 0 ? Math.max(level, Math.round(base * rate * level)) : 0;
  result.stats = { ...item.stats, [key]: base + bonus };
  result.stat = base + bonus;
  if (item.type === "armor") {
    const hp = Number(item.stats?.health ?? item.dungeon?.healthBonus ?? 0);
    const { armorHealthPerLevel: hpRate, minimumArmorHealthPerLevel: hpMin } = craftingConfig.reinforcement;
    if (!Number.isFinite(hp) || hp < 0 || !Number.isFinite(hpRate) || hpRate < 0 || hpRate > 1 ||
        !Number.isSafeInteger(hpMin) || hpMin < 0) throw new Error("Invalid reinforcement health bonus.");
    const health = hp + Math.max(hpMin * level, Math.round(hp * hpRate * level));
    result.stats.health = health;
    result.dungeon = { ...result.dungeon, healthBonus: health };
  }
  result.name = `${item.name} +${level}`;
  return result;
}

export function reinforcementCost(item, nextLevel) {
  const level = upgradeLevel(nextLevel), config = craftingConfig.reinforcement;
  if (!level || !["weapon", "armor"].includes(item?.type)) throw new Error("That item cannot be reinforced.");
  const factor = config.rarityFactors[item.dungeon?.rarity ?? "common"];
  const fee = config.fees[level] * factor, count = config.materialCounts[level] * factor;
  if (!Number.isSafeInteger(fee) || fee < 0 || !Number.isSafeInteger(count) || count < 1 || count > 1000) throw new Error("Invalid reinforcement cost.");
  return { fee, ingredients: [{ itemId: "catsteel-scrap", quantity: count }, { itemId: "enchanted-fur", quantity: Math.ceil(count / 2) }] };
}
