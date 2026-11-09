// Player-side hit resolution for new runs. Armor remains damage reduction;
// accuracy is an independent per-hit chance, not a second armor formula.
export function resolvePlayerAttack({ player, enemy, skill, combat, specialCombat, round, roll, variance }) {
  const hits = skill?.hits ?? 1;
  const accuracyBonus = player.accuracyBonus ?? 0;
  if (!Number.isFinite(accuracyBonus) || accuracyBonus < 0 || accuracyBonus > 1) throw new Error("Invalid accuracy bonus.");
  const baseAccuracy = skill?.accuracy ?? specialCombat.normalAccuracy;
  const accuracy = Math.min(1, baseAccuracy + accuracyBonus);
  const multiplier = skill?.multiplier ?? 1;
  const critMultiplier = skill?.critDamageMultiplier ?? combat.criticalDamageMultiplier;
  const critBonus = skill?.critBonus ?? 0;
  const pierce = skill?.armorPierce ?? 0;
  if (!Number.isSafeInteger(hits) || hits < 1 || hits > 6 ||
    !Number.isFinite(baseAccuracy) || baseAccuracy < 0 || baseAccuracy > 1 ||
    !Number.isFinite(multiplier) || multiplier < 0 || multiplier > 10 ||
    !Number.isFinite(critMultiplier) || critMultiplier < 1 || critMultiplier > 5 ||
    !Number.isFinite(critBonus) || critBonus < -1 || critBonus > 1 ||
    !Number.isFinite(pierce) || pierce < 0 || pierce > 1) {
    throw new Error("Invalid special attack rules.");
  }
  const critChance = Math.max(0, Math.min(1, player.critChance + critBonus));
  const defense = enemy.defense * (enemy.armorBreakUntil >= round ? combat.armorBreakDefenseMultiplier : 1) * (1 - pierce);
  const reduction = Math.min(combat.maxArmorReduction, defense / (defense + combat.armorConstant));
  const buff = (player.attackBuffTurns ?? 0) > 0 ? player.attackBuffMultiplier : 1;
  let actualDamage = 0, landedHits = 0;
  const labels = [];
  for (let hit = 0; hit < hits && enemy.hp > 0; hit++) {
    if (accuracy < 1 && roll() >= accuracy) { labels.push("MISS"); continue; }
    landedHits++;
    const critical = skill?.canCrit !== false && roll() < critChance;
    const damage = Math.max(combat.minimumDamage, Math.round(
      player.attack * combat.playerDamageMultiplier * buff * variance() * multiplier *
      (critical ? critMultiplier : 1) * (1 - reduction)
    ));
    const lost = Math.min(enemy.hp, damage);
    enemy.hp = Math.max(0, enemy.hp - lost);
    actualDamage += lost;
    labels.push(`${lost}${critical ? " CRIT" : ""}`);
  }
  return { actualDamage, landedHits, labels };
}
