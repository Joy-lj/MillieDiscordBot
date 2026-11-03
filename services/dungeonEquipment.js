import { ACTIVE_SKILLS, PASSIVES_BY_ID } from "./dungeonAbilities.js";

const SLOTS = new Set([
  "main_hand", "off_hand", "head", "torso", "legs", "hands",
  "feet", "cape", "neck", "ring", "ammo",
]);
function number(value, min, max, name) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Invalid dungeon equipment ${name}.`);
  }
  return value;
}

// Call with the SAME PostgreSQL client after locking this player's account.
export async function loadDungeonEquipment(client, guildId, userId, items) {
  const { rows } = await client.query(
    `SELECT e.slot, i.id, i.item_id, i.serial_number
     FROM public.user_equipment e
     JOIN public.user_items i ON i.id = e.item_instance_id
       AND i.guild_id = e.guild_id AND i.user_id = e.user_id
     WHERE e.guild_id = $1 AND e.user_id = $2
     ORDER BY e.slot`,
    [guildId, userId]
  );
  const equipment = {};
  for (const row of rows) {
    const item = Object.hasOwn(items, row.item_id) ? items[row.item_id] : null;
    if (!SLOTS.has(row.slot) || !item || item.slot !== row.slot) continue;
    const instanceId = Number(row.id), serialNumber = Number(row.serial_number);
    if (!Number.isSafeInteger(instanceId) || instanceId < 1 ||
      !Number.isSafeInteger(serialNumber) || serialNumber < 1) {
      throw new Error("Invalid equipped item instance.");
    }
    equipment[row.slot] = {
      instanceId, itemId: row.item_id, serialNumber,
      item: structuredClone(item),
    };
  }
  if (equipment.main_hand?.item.handedness === 2) delete equipment.off_hand;
  return equipment;
}

// Different passive effects combine. Duplicate passive IDs apply only once.
function combinePassives(equipment) {
  const unique = new Map();
  for (const { item } of Object.values(equipment)) {
    const id = item.dungeon?.passive?.id;
    if (id && PASSIVES_BY_ID[id]) unique.set(id, structuredClone(PASSIVES_BY_ID[id]));
  }
  const passives = [...unique.values()];
  if (!passives.length) return { passive: null, passives };
  const sum = (key) => passives.reduce((total, p) => total + (p[key] ?? 0), 0);
  const passive = {
    id: "equipment-passives",
    name: passives.map(p => p.name).join(" + "),
    damageMultiplier: passives.reduce((total, p) => total * (p.damageMultiplier ?? 1), 1),
    shieldRatio: Math.min(1, sum("shieldRatio")),
    regenRatio: Math.min(1, sum("regenRatio")),
    reflectRatio: Math.min(1, sum("reflectRatio")),
    critBonus: Math.min(1, sum("critBonus")),
    lethalSaves: sum("lethalSaves"),
  };
  return { passive, passives };
}

// The combat engine passes its resolved config so base stats remain configurable.
export function makeLoadoutPlayer(userId, loadout, config, combat) {
  const equipment = structuredClone(loadout);
  if (equipment.main_hand?.item.handedness === 2) delete equipment.off_hand;
  const gearStats = { attack: 0, defense: 0, health: 0, speed: 0, critChance: 0 };
  for (const [slot, entry] of Object.entries(equipment)) {
    if (!SLOTS.has(slot) || entry.item?.slot !== slot) throw new Error("Invalid dungeon equipment slot.");
    const stats = entry.item.stats ?? {};
    for (const key of ["attack", "defense", "health", "speed", "critChance"]) {
      const limit = key === "critChance" ? 1 : key === "speed" ? combat.speedBonusLimit :
        key === "health" ? combat.maxArmorHealthBonus : combat.maxGearStat;
      gearStats[key] += number(stats[key] ?? 0, key === "speed" ? -limit : 0, limit, `${slot} ${key}`);
    }
  }
  for (const key of ["attack", "defense", "health", "speed"]) {
    const limit = key === "speed" ? combat.speedBonusLimit :
      key === "health" ? combat.maxArmorHealthBonus : combat.maxGearStat;
    number(gearStats[key], key === "speed" ? -limit : 0, limit, `total ${key}`);
  }
  const main = equipment.main_hand, torso = equipment.torso;
  const { passive, passives } = combinePassives(equipment);
  const maxHealth = Math.round(combat.baseHealth + gearStats.health);
  const abilityId = main?.item.dungeon?.ability?.id;
  // Main-hand crit is included in gearStats. Unarmed players use the fallback.
  const critChance = Math.min(1, gearStats.critChance +
    (main ? 0 : combat.defaultCritChance) + (passive?.critBonus ?? 0));
  return {
    userId, maxHealth, hp: maxHealth,
    attack: combat.baseAttack + gearStats.attack,
    defense: gearStats.defense,
    speed: Math.max(combat.minimumSpeed, combat.baseSpeed + gearStats.speed),
    critChance,
    weaponName: main ? `${main.item.name} #${main.serialNumber}` : "Fists",
    armorName: torso ? `${torso.item.name} #${torso.serialNumber}` : "None",
    skill: abilityId && ACTIVE_SKILLS[abilityId] ? abilityId : null,
    skillCooldown: 0, potions: config.potionsPerPlayer, choice: null,
    passive, passives,
    shield: Math.ceil(maxHealth * (passive?.shieldRatio ?? 0)),
    lethalSaves: passive?.lethalSaves ?? 0,
    attackBuffTurns: 0, attackBuffMultiplier: 1, exposedUntil: 0,
    equipment, gearStats,
    baseStats: { health: combat.baseHealth, attack: combat.baseAttack, speed: combat.baseSpeed },
  };
}
