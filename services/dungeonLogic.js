import { randomInt } from "node:crypto";

export class DungeonError extends Error {}
const fail = (message) => { throw new DungeonError(message); };
export const skills = {
  "distracting-bonk": { name: "Distracting Bonk", cooldown: 3, multiplier: 1 },
  "dirty-cut": { name: "Dirty Cut", cooldown: 3, multiplier: 1 },
  "bottle-smash": { name: "Bottle Smash", cooldown: 3, multiplier: 1.5 },
  "cookie-barrage": { name: "Cookie Barrage", cooldown: 4, multiplier: 1.75 },
};
const defaults = {
  "foam-sword": { speedBonus: 5, critChance: 0.05, ability: { id: "distracting-bonk" } },
  "rusty-shank": { speedBonus: 3, critChance: 0.15, ability: { id: "dirty-cut" } },
  "beer-bottle": { speedBonus: 0, critChance: 0.10, ability: { id: "bottle-smash" } },
  gun: { speedBonus: -3, critChance: 0.10, ability: { id: "cookie-barrage" } },
  "bicycle-helmet": { healthBonus: 10, speedBonus: 3 },
  "padded-pants": { healthBonus: 25, speedBonus: 1 },
  "chainmail-shirt": { healthBonus: 45, speedBonus: -2 },
  "bulletproof-vest": { healthBonus: 70, speedBonus: -5 },
};

function finite(value, min, max, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) fail(`Invalid ${label}.`);
  return value;
}
function chance(rng) {
  const draw = rng(10000);
  if (!Number.isInteger(draw) || draw < 0 || draw >= 10000) fail("Invalid random draw.");
  return draw / 10000;
}
function enemyFor(room) {
  return { ...room, maxHealth: room.health, hp: room.health, weakAttacks: 0, armorBreakUntil: 0, bleedUntil: 0, bleedDamage: 0 };
}

export function makePlayer(userId, weaponId, armorId, items, config) {
  const candidateWeapon = items[weaponId];
  const candidateArmor = items[armorId];
  const weapon = candidateWeapon?.type === "weapon" ? candidateWeapon : null;
  const armor = candidateArmor?.type === "armor" ? candidateArmor : null;
  const w = weapon ? { ...defaults[weaponId], ...weapon.dungeon } : {};
  const a = armor ? { ...defaults[armorId], ...armor.dungeon } : {};
  const maxHealth = Math.round(100 + finite(a.healthBonus ?? 0, 0, 10000, "armor health bonus"));
  const skill = skills[w.ability?.id] ? w.ability.id : null;
  return {
    userId, maxHealth, hp: maxHealth,
    attack: 8 + finite(weapon?.stat ?? 0, 0, 10000, "weapon stat"),
    defense: finite(armor?.stat ?? 0, 0, 10000, "armor stat"),
    speed: Math.max(1, 10 + finite(w.speedBonus ?? 0, -100, 100, "weapon speed") + finite(a.speedBonus ?? 0, -100, 100, "armor speed")),
    critChance: finite(w.critChance ?? 0.05, 0, 1, "critical chance"),
    weaponName: weapon?.name ?? "Fists", armorName: armor?.name ?? "None",
    skill, skillCooldown: 0, potions: config.potionsPerPlayer, choice: null,
  };
}

export function validateConfig(config) {
  for (const name of ["inviteMs", "roundMs", "cooldownMs", "maxRoundsPerRoom", "potionsPerPlayer"]) {
    if (!Number.isSafeInteger(config[name]) || config[name] < 1) fail(`Invalid dungeon ${name}.`);
  }
  finite(config.potionHeal, 0.01, 1, "potion healing");
  finite(config.roomRestHeal, 0, 1, "rest healing");
  if (!config.difficulties || !Object.keys(config.difficulties).length) fail("No dungeons configured.");
  for (const dungeon of Object.values(config.difficulties)) {
    if (!dungeon.name || !Number.isSafeInteger(dungeon.reward) || dungeon.reward < 1 || dungeon.reward > 1_000_000) fail("Invalid dungeon reward.");
    if (!Array.isArray(dungeon.rooms) || dungeon.rooms.length !== 3) fail("Each dungeon needs three rooms.");
    for (const room of dungeon.rooms) {
      if (!room.name) fail("Enemy name is missing.");
      for (const field of ["health", "attack", "defense", "speed"]) finite(room[field], field === "defense" ? 0 : 1, 1_000_000, `enemy ${field}`);
    }
  }
}

export function startState(dungeon, players, config) {
  return {
    version: 1, status: "active", dungeon: structuredClone(dungeon), rules: structuredClone(config),
    players, room: 0, round: 1, roomRound: 1, enemy: enemyFor(dungeon.rooms[0]),
    log: ["The party entered the dungeon. Lock in your first actions."],
  };
}

export function validateChoice(player, choice) {
  if (player.hp <= 0) fail("You are knocked out. Your teammate can continue.");
  if (player.choice) fail("Your action is already locked for this round.");
  if (!["attack", "defend", "skill", "heal"].includes(choice)) fail("Unknown combat action.");
  if (choice === "skill" && (!player.skill || player.skillCooldown > 0)) fail("Your weapon skill is unavailable or cooling down.");
  if (choice === "heal" && (player.potions <= 0 || player.hp >= player.maxHealth)) fail("You need missing health and an available potion to heal.");
}

export function resolveRound(input, rng = randomInt) {
  const state = structuredClone(input);
  const enemy = state.enemy;
  const alive = state.players.filter((player) => player.hp > 0);
  if (!alive.length || alive.some((player) => !player.choice)) fail("The round is not ready.");
  const log = [];
  const order = [
    ...alive.map((player, index) => ({ player, speed: player.speed, index })),
    { enemy: true, speed: enemy.speed, index: 2 },
  ].sort((a, b) => b.speed - a.speed || a.index - b.index);

  for (const actor of order) {
    if (enemy.hp <= 0) break;
    if (actor.enemy) {
      const targets = state.players.filter((player) => player.hp > 0);
      if (!targets.length) break;
      const target = targets[Math.floor(chance(rng) * targets.length)];
      const reduction = Math.min(0.65, target.defense / (target.defense + 100));
      let damage = enemy.attack * (0.9 + chance(rng) * 0.2) * (1 - reduction);
      if (enemy.weakAttacks > 0) { damage *= 0.75; enemy.weakAttacks -= 1; }
      if (target.choice === "defend") damage *= 0.5;
      damage = Math.max(1, Math.round(damage));
      target.hp = Math.max(0, target.hp - damage);
      log.push(`${enemy.name} hit <@${target.userId}> for ${damage}${target.hp === 0 ? " — knocked out!" : "."}`);
      continue;
    }
    const player = actor.player;
    if (player.hp <= 0) continue;
    if (player.choice === "defend") { log.push(`<@${player.userId}> guarded: incoming damage is halved this round.`); continue; }
    if (player.choice === "heal") {
      const healed = Math.min(player.maxHealth - player.hp, Math.ceil(player.maxHealth * state.rules.potionHeal));
      player.hp += healed; player.potions -= 1;
      log.push(`<@${player.userId}> used a potion and recovered ${healed} HP.`);
      continue;
    }
    const skill = player.choice === "skill" ? skills[player.skill] : null;
    const critical = chance(rng) < player.critChance;
    const defense = enemy.defense * (enemy.armorBreakUntil >= state.round ? 0.75 : 1);
    const reduction = Math.min(0.65, defense / (defense + 100));
    const damage = Math.max(1, Math.round(player.attack * (0.9 + chance(rng) * 0.2) *
      (skill?.multiplier ?? 1) * (critical ? 1.5 : 1) * (1 - reduction)));
    enemy.hp = Math.max(0, enemy.hp - damage);
    log.push(`<@${player.userId}> used ${skill?.name ?? "Attack"}: ${damage} damage${critical ? " (critical)" : ""}.`);
    if (skill) {
      player.skillCooldown = skill.cooldown + 1;
      if (player.skill === "distracting-bonk") enemy.weakAttacks = 1;
      if (player.skill === "dirty-cut") {
        enemy.bleedDamage = Math.max(2, Math.floor(player.attack * 0.2));
        enemy.bleedUntil = state.round + 1;
      }
      if (player.skill === "bottle-smash") enemy.armorBreakUntil = state.round + 1;
    }
  }
  if (enemy.hp > 0 && enemy.bleedUntil >= state.round) {
    enemy.hp = Math.max(0, enemy.hp - enemy.bleedDamage);
    log.push(`Bleeding dealt ${enemy.bleedDamage} damage.`);
  }
  for (const player of state.players) {
    player.choice = null;
    player.skillCooldown = Math.max(0, player.skillCooldown - 1);
  }
  if (state.players.every((player) => player.hp <= 0)) {
    state.status = "lost"; log.push("The party was defeated. No clear reward was earned.");
  } else if (enemy.hp <= 0) {
    log.push(`${enemy.name} was defeated!`);
    state.room += 1;
    if (state.room === state.dungeon.rooms.length) {
      state.status = "won"; log.push("Dungeon cleared! Each player can claim their reward.");
    } else {
      for (const player of state.players) {
        if (player.hp > 0) player.hp = Math.min(player.maxHealth, player.hp + Math.ceil(player.maxHealth * state.rules.roomRestHeal));
      }
      state.enemy = enemyFor(state.dungeon.rooms[state.room]);
      state.roomRound = 1;
      log.push(`Surviving players recovered ${Math.round(state.rules.roomRestHeal * 100)}% max HP during the rest.`);
    }
  } else if (state.roomRound >= state.rules.maxRoundsPerRoom) {
    state.status = "lost"; log.push("The room's round limit was reached. No clear reward was earned.");
  } else state.roomRound += 1;
  state.round += 1;
  state.log = log.slice(-8);
  return state;
}
