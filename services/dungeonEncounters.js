const invalid = message => { throw new Error(`Invalid dungeon encounter: ${message}.`); };
const number = (n, min, max, name) => {
  if (!Number.isFinite(n) || n < min || n > max) invalid(name);
};

function validateProfile(profile) {
  if (!profile || typeof profile.name !== "string" || !profile.name || profile.name.length > 80 || !Array.isArray(profile.pattern) || !profile.pattern.length || profile.pattern.length > 8) invalid("profile");
  if (profile.enrage) {
    number(profile.enrage.below, 0.01, 1, "enrage threshold");
    number(profile.enrage.multiplier, 1, 3, "enrage multiplier");
  }
  for (const move of profile.pattern) {
    if (!move || typeof move.name !== "string" || !move.name || move.name.length > 80 || !["attack", "heal"].includes(move.kind)) invalid("move");
    if (move.hint != null && (typeof move.hint !== "string" || move.hint.length > 300)) invalid("move hint");
    number(move.incomingMultiplier ?? 1, 0.1, 2, "incoming damage multiplier");
    if (move.kind === "heal") {
      if (move.target !== "self" || move.interruptible !== true) invalid("healing channel");
      number(move.healRatio, 0.01, 0.3, "healing ratio");
    } else {
      if (!["random", "all", "marked"].includes(move.target) || move.interruptible) invalid("attack target");
      number(move.multiplier, 0.1, 4, "attack multiplier");
      if (move.defendMultiplier != null) number(move.defendMultiplier, 0.05, 1, "guard multiplier");
    }
  }
}

export function validateEncounterConfig(config) {
  const entry = config.encounters;
  if (!entry || entry.enabled === false) return;
  if (entry.enabled !== true || !entry.rotation || !Number.isSafeInteger(entry.rotation.intervalMs) || entry.rotation.intervalMs < 60_000 || entry.rotation.intervalMs > 365 * 86_400_000 ||
      !Number.isSafeInteger(entry.rotation.epochMs) || Math.abs(entry.rotation.epochMs) > 8_000_000_000_000_000 ||
      typeof entry.rotation.seed !== "string" || entry.rotation.seed.length > 100 || !entry.profiles || !entry.pools) invalid("rotation settings");
  for (const profile of Object.values(entry.profiles)) validateProfile(profile);
  for (const [difficulty, dungeon] of Object.entries(config.difficulties)) {
    const pool = entry.pools[difficulty];
    if (!Array.isArray(pool) || pool.length !== dungeon.rooms.length) invalid(`room pools for ${difficulty}`);
    for (const variants of pool) {
      if (!Array.isArray(variants) || !variants.length || variants.length > 10) invalid("enemy pool size");
      for (const variant of variants) if (!variant || typeof variant.name !== "string" || !variant.name || variant.name.length > 80 || !Object.hasOwn(entry.profiles, variant.profile)) invalid("enemy variant");
    }
  }
}

function hash(text) {
  let result = 2166136261;
  for (const char of text) result = Math.imul(result ^ char.codePointAt(0), 16777619) >>> 0;
  return result;
}

export function selectDungeonEncounter(config, difficulty, now = Date.now()) {
  if (!Object.hasOwn(config.difficulties, difficulty)) invalid("difficulty");
  const dungeon = structuredClone(config.difficulties[difficulty]);
  if (!config.encounters || config.encounters.enabled === false) return dungeon;
  validateEncounterConfig(config);
  if (!Number.isSafeInteger(now)) invalid("rotation clock");
  const { intervalMs, epochMs, seed } = config.encounters.rotation;
  const cycle = Math.floor((now - epochMs) / intervalMs);
  dungeon.encounterVersion = 1;
  dungeon.rotation = { cycle, nextAt: epochMs + (cycle + 1) * intervalMs, intervalMs };
  dungeon.rooms = dungeon.rooms.map((room, slot) => {
    const pool = config.encounters.pools[difficulty][slot];
    const index = ((cycle % pool.length) + hash(`${seed}:${difficulty}:${slot}`) % pool.length + pool.length) % pool.length;
    const variant = pool[index];
    return { ...room, name: variant.name, mechanics: structuredClone(config.encounters.profiles[variant.profile]) };
  });
  return dungeon;
}

export function prepareEnemyIntent(state) {
  if (state.rules.encounterVersion !== 1 || state.status !== "active") return;
  const enemy = state.enemy;
  validateProfile(enemy.mechanics);
  const phase = enemy.mechanics.enrage;
  if (phase && enemy.hp / enemy.maxHealth <= phase.below) enemy.enraged = true;
  const move = structuredClone(enemy.mechanics.pattern[(state.roomRound - 1) % enemy.mechanics.pattern.length]);
  const living = state.players.filter(p => p.hp > 0);
  const marked = [...living].sort((a, b) => a.hp / a.maxHealth - b.hp / b.maxHealth || a.userId.localeCompare(b.userId))[0];
  enemy.intent = { round: state.round, move, targetId: move.target === "marked" ? marked?.userId ?? null : null,
    enrageMultiplier: enemy.enraged ? phase?.multiplier ?? 1 : 1 };
}

export function enemyIntent(state) {
  if (state.rules.encounterVersion !== 1) return null;
  if (!state.enemy.intent || state.enemy.intent.round !== state.round) invalid("missing saved intent");
  return state.enemy.intent;
}

export const bossDamageTaken = state => enemyIntent(state)?.move.incomingMultiplier ?? 1;
export const bossAttackMultiplier = state => {
  const intent = enemyIntent(state);
  return intent ? (intent.move.multiplier ?? 0) * intent.enrageMultiplier : 1;
};
export const bossGuardMultiplier = (state, fallback) => enemyIntent(state)?.move.defendMultiplier ?? fallback;

export function bossTargets(state, living, roll) {
  const intent = enemyIntent(state);
  if (!intent || intent.move.target === "random") return [living[Math.floor(roll() * living.length)]];
  if (intent.move.target === "all") return living;
  return living.filter(player => player.userId === intent.targetId);
}

export function resolveBossChannel(state, log) {
  const intent = enemyIntent(state);
  if (!intent || intent.move.kind !== "heal") return false;
  if (state.enemy.interruptedRound === state.round) log.push(`${state.enemy.name}'s ${intent.move.name} was interrupted!`);
  else {
    const heal = Math.min(state.enemy.maxHealth - state.enemy.hp, Math.ceil(state.enemy.maxHealth * intent.move.healRatio));
    state.enemy.hp += heal;
    log.push(`${state.enemy.name} completed ${intent.move.name} and recovered ${heal} HP.`);
  }
  return true;
}

export function recordBossSkillHit(state, skill, actualDamage, landedHits, log) {
  const intent = enemyIntent(state);
  if (intent?.move.interruptible && skill && (skill.multiplier ?? 1) > 0 && !skill.healRatio && landedHits > 0 && actualDamage > 0 && state.enemy.interruptedRound !== state.round) {
    state.enemy.interruptedRound = state.round;
    log.push(`${skill.name} broke ${state.enemy.name}'s healing channel!`);
  }
}

export function describeEnemyIntent(state) {
  const intent = enemyIntent(state);
  if (!intent) return null;
  const { move } = intent;
  const target = move.target === "marked" ? `Marked target: <@${intent.targetId}>.` : move.target === "all" ? "Targets the whole living party." : move.target === "random" ? "Targets one random living player." : "Healing channel; acts after the party.";
  const effect = move.kind === "heal" ? `Restores ${Math.round(move.healRatio * 100)}% max HP if uninterrupted.`
    : `${Number((move.multiplier * intent.enrageMultiplier).toFixed(2))}× normal attack damage.`;
  const guard = move.defendMultiplier == null ? "" : `\nDefend reduces this hit by ${Math.round((1 - move.defendMultiplier) * 100)}%.`;
  const stance = move.incomingMultiplier == null ? "" : `\nBoss takes ${Math.round(move.incomingMultiplier * 100)}% of normal direct damage this round.`;
  return `**${move.name}**${state.enemy.enraged ? " • 🔥 ENRAGED" : ""}\n${target}\n${effect}${guard}${stance}\n${move.hint ?? "Attack, recover, or guard as needed."}`;
}
