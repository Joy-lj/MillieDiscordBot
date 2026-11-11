// Rules are snapshotted at entry; existing runs keep their saved tuning.
export function cooldownBucket(difficulty, rules = {}) {
  return rules.cooldownBucket ?? (difficulty === "ultra" ? "ultra" : "regular");
}

export function buildDungeonBalance(config, difficulty, challenge = null, items = {}) {
  const base = config.difficulties[difficulty];
  if (!base) throw new Error("Unknown dungeon difficulty.");
  const modifier = challenge == null ? null : config.challenges?.[challenge];
  if (challenge != null && (!modifier || modifier.difficulty !== difficulty)) {
    throw new Error("Nightmare is available only for Ultra.");
  }
  const maxRoundsPerRoom = modifier?.maxRoundsPerRoom ?? base.maxRoundsPerRoom ?? config.maxRoundsPerRoom;
  if (!Number.isSafeInteger(maxRoundsPerRoom) || maxRoundsPerRoom < 1 || maxRoundsPerRoom > 100) throw new Error("Invalid dungeon round limit.");
  const healthMultiplier = modifier?.healthMultiplier ?? 1;
  const attackMultiplier = modifier?.attackMultiplier ?? 1;
  if (![healthMultiplier, attackMultiplier].every(n => Number.isFinite(n) && n > 0 && n <= 10)) throw new Error("Invalid dungeon challenge scaling.");
  const rules = structuredClone(config);
  rules.cooldownMs = base.cooldownMs ?? config.cooldownMs;
  rules.cooldownBucket = cooldownBucket(difficulty, base);
  if (!["regular", "ultra"].includes(rules.cooldownBucket)) throw new Error("Invalid dungeon cooldown bucket.");
  rules.maxRoundsPerRoom = maxRoundsPerRoom;
  const drops = modifier?.guaranteedLoot ?? base.guaranteedLoot ?? [];
  if (!Array.isArray(drops) || drops.length > 5) throw new Error("Invalid guaranteed loot.");
  const guaranteedLoot = drops.map(drop => {
    const item = Object.hasOwn(items, drop.itemId) ? items[drop.itemId] : null;
    if (!item || item.type !== "material" || !Number.isSafeInteger(drop.quantity) || drop.quantity < 1 || drop.quantity > 10) throw new Error("Invalid guaranteed dungeon material.");
    return { itemId: drop.itemId, name: item.name, quantity: drop.quantity };
  });
  return { rules, guaranteedLoot, challenge, healthMultiplier, attackMultiplier, name: modifier?.name ?? null };
}

export function scaleDungeonChallenge(encounter, balance) {
  const result = structuredClone(encounter);
  if (balance.name) result.name += ` • ${balance.name}`;
  result.rooms = result.rooms.map(room => ({ ...room,
    health: Math.round(room.health * balance.healthMultiplier),
    attack: Math.round(room.attack * balance.attackMultiplier),
  }));
  return result;
}
