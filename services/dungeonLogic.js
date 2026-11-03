import { randomInt } from "node:crypto";
import { makeLoadoutPlayer } from "./dungeonEquipment.js";

import {
  ACTIVE_SKILLS,
  PASSIVES_BY_ID,
} from "./dungeonAbilities.js";

import {
  dungeonCombat,
  dungeonEquipmentDefaults,
} from "../src/config/dungeonCombat.js";

export class DungeonError extends Error { }

const fail = (message) => {
  throw new DungeonError(message);
};

export const skills = ACTIVE_SKILLS;

// Compatibility baseline for old saved runs.
// Edit dungeonCombat.js for new runs; leave this unchanged.
const LEGACY_COMBAT = {
  baseHealth: 100,
  baseAttack: 8,
  baseSpeed: 10,
  minimumSpeed: 1,
  defaultCritChance: 0.05,
  playerDamageMultiplier: 1,
  enemyDamageMultiplier: 1,
  damageVarianceMin: 0.9,
  damageVarianceMax: 1.1,
  criticalDamageMultiplier: 1.5,
  minimumDamage: 1,
  armorConstant: 100,
  maxArmorReduction: 0.65,
  defendDamageMultiplier: 0.5,
  exposureDamageMultiplier: 1.2,
  armorBreakDefenseMultiplier: 0.75,
  defaultWeakMultiplier: 0.75,
  bleedAttackRatio: 0.2,
  minimumBleedDamage: 2,
  minimumReflectDamage: 1,
  maxGearStat: 10_000,
  maxArmorHealthBonus: 10_000,
  speedBonusLimit: 100,
  maxEnemyStat: 1_000_000,
  maxClearReward: 1_000_000,
  roomsPerDungeon: 3,
  maxLogEntries: 8,
};

function finite(value, min, max, label) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    fail(`Invalid ${label}.`);
  }

  return value;
}

export function resolveCombatConfig(
  overrides = {},
  base = dungeonCombat
) {
  if (
    !overrides ||
    typeof overrides !== "object" ||
    Array.isArray(overrides)
  ) {
    fail("Invalid combat config.");
  }

  for (const key of Object.keys(overrides)) {
    if (!Object.hasOwn(LEGACY_COMBAT, key)) {
      fail(`Unknown combat setting: ${key}`);
    }
  }

  for (const key of Object.keys(base)) {
    if (!Object.hasOwn(LEGACY_COMBAT, key)) {
      fail(`Unknown combat setting: ${key}`);
    }
  }

  const result = {
    ...LEGACY_COMBAT,
    ...base,
    ...overrides,
  };

  for (const [key, value] of Object.entries(result)) {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value)
    ) {
      fail(`Invalid combat ${key}.`);
    }
  }

  const positiveSettings = [
    "baseHealth",
    "minimumSpeed",
    "armorConstant",
    "damageVarianceMax",
    "criticalDamageMultiplier",
    "maxGearStat",
    "maxArmorHealthBonus",
    "speedBonusLimit",
    "maxEnemyStat",
    "maxClearReward",
  ];

  for (const key of positiveSettings) {
    finite(
      result[key],
      Number.EPSILON,
      Number.MAX_SAFE_INTEGER,
      `combat ${key}`
    );
  }

  const nonnegativeSettings = [
    "baseAttack",
    "baseSpeed",
    "damageVarianceMin",
    "playerDamageMultiplier",
    "enemyDamageMultiplier",
    "exposureDamageMultiplier",
    "bleedAttackRatio",
  ];

  for (const key of nonnegativeSettings) {
    finite(
      result[key],
      0,
      Number.MAX_SAFE_INTEGER,
      `combat ${key}`
    );
  }

  const percentageSettings = [
    "defaultCritChance",
    "maxArmorReduction",
    "defendDamageMultiplier",
    "armorBreakDefenseMultiplier",
    "defaultWeakMultiplier",
  ];

  for (const key of percentageSettings) {
    finite(result[key], 0, 1, `combat ${key}`);
  }

  const floors = [
    "minimumDamage",
    "minimumBleedDamage",
    "minimumReflectDamage",
  ];

  for (const key of floors) {
    if (
      !Number.isSafeInteger(result[key]) ||
      result[key] < 0
    ) {
      fail(`Invalid combat ${key}.`);
    }
  }

  for (const key of ["roomsPerDungeon", "maxLogEntries"]) {
    if (
      !Number.isSafeInteger(result[key]) ||
      result[key] < 1 ||
      result[key] > 100
    ) {
      fail(`Invalid combat ${key}.`);
    }
  }

  if (
    result.baseHealth < 1 ||
    result.minimumSpeed < 1 ||
    result.damageVarianceMax < result.damageVarianceMin
  ) {
    fail("Invalid combat health, speed or damage variance.");
  }

  for (const key of [
    "baseHealth",
    "baseAttack",
    "maxGearStat",
    "maxArmorHealthBonus",
    "maxEnemyStat",
    "armorConstant",
  ]) {
    finite(result[key], 0, 1_000_000, `combat ${key}`);
  }

  for (const key of [
    "baseSpeed",
    "minimumSpeed",
    "speedBonusLimit",
  ]) {
    finite(result[key], 0, 10_000, `combat ${key}`);
  }

  for (const key of [
    "playerDamageMultiplier",
    "enemyDamageMultiplier",
    "damageVarianceMin",
    "damageVarianceMax",
    "criticalDamageMultiplier",
    "exposureDamageMultiplier",
    "bleedAttackRatio",
  ]) {
    finite(result[key], 0, 100, `combat ${key}`);
  }

  for (const key of floors) {
    finite(result[key], 0, 1_000_000, `combat ${key}`);
  }

  return result;
}

function chance(rng) {
  const draw = rng(10000);

  if (
    !Number.isInteger(draw) ||
    draw < 0 ||
    draw >= 10000
  ) {
    fail("Invalid random draw.");
  }

  return draw / 10000;
}

function enemyFor(room, combat) {
  return {
    ...room,
    maxHealth: room.health,
    hp: room.health,
    weakAttacks: 0,
    weakMultiplier: combat.defaultWeakMultiplier,
    armorBreakUntil: 0,
    bleedUntil: 0,
    bleedDamage: 0,
  };
}

export function makePlayer(
  userId,
  weaponId,
  armorId,
  items,
  config,
  loadout = null
) {
  const combat = resolveCombatConfig(config.combat ?? {});

  // New runs use every equipped slot; legacy callers remain supported.
  if (loadout !== null) {
    return makeLoadoutPlayer(userId, loadout, config, combat);
  }

  const candidateWeapon = Object.hasOwn(items, weaponId)
    ? items[weaponId]
    : null;

  const candidateArmor = Object.hasOwn(items, armorId)
    ? items[armorId]
    : null;

  const weapon = candidateWeapon?.type === "weapon"
    ? candidateWeapon
    : null;

  const armor = candidateArmor?.type === "armor"
    ? candidateArmor
    : null;

  const w = weapon
    ? {
      ...dungeonEquipmentDefaults[weaponId],
      ...weapon.dungeon,
    }
    : {};

  const a = armor
    ? {
      ...dungeonEquipmentDefaults[armorId],
      ...armor.dungeon,
    }
    : {};

  const maxHealth = Math.round(
    combat.baseHealth +
    finite(
      a.healthBonus ?? 0,
      0,
      combat.maxArmorHealthBonus,
      "armor health bonus"
    )
  );

  const skill = skills[w.ability?.id]
    ? w.ability.id
    : null;

  const passive = PASSIVES_BY_ID[a.passive?.id]
    ? structuredClone(PASSIVES_BY_ID[a.passive.id])
    : null;

  const speed = Math.max(
    combat.minimumSpeed,
    combat.baseSpeed +
    finite(
      w.speedBonus ?? 0,
      -combat.speedBonusLimit,
      combat.speedBonusLimit,
      "weapon speed"
    ) +
    finite(
      a.speedBonus ?? 0,
      -combat.speedBonusLimit,
      combat.speedBonusLimit,
      "armor speed"
    )
  );

  return {
    userId,
    maxHealth,
    hp: maxHealth,

    attack:
      combat.baseAttack +
      finite(
        weapon?.stat ?? 0,
        0,
        combat.maxGearStat,
        "weapon stat"
      ),

    defense: finite(
      armor?.stat ?? 0,
      0,
      combat.maxGearStat,
      "armor stat"
    ),

    speed,

    critChance: Math.min(
      1,
      finite(
        w.critChance ?? combat.defaultCritChance,
        0,
        1,
        "critical chance"
      ) + (passive?.critBonus ?? 0)
    ),

    weaponName: weapon?.name ?? "Fists",
    armorName: armor?.name ?? "None",

    skill,
    skillCooldown: 0,
    potions: config.potionsPerPlayer,
    choice: null,

    passive,

    shield: passive?.shieldRatio
      ? Math.ceil(maxHealth * passive.shieldRatio)
      : 0,

    lethalSaves: passive?.lethalSaves ?? 0,

    attackBuffTurns: 0,
    attackBuffMultiplier: 1,
    exposedUntil: 0,
  };
}

export function validateConfig(config) {
  const combat = resolveCombatConfig(config.combat ?? {});

  for (const name of [
    "inviteMs",
    "roundMs",
    "cooldownMs",
    "maxRoundsPerRoom",
  ]) {
    if (
      !Number.isSafeInteger(config[name]) ||
      config[name] < 1
    ) {
      fail(`Invalid dungeon ${name}.`);
    }
  }

  if (
    !Number.isSafeInteger(config.potionsPerPlayer) ||
    config.potionsPerPlayer < 0
  ) {
    fail("Invalid dungeon potionsPerPlayer.");
  }

  finite(config.potionHeal, 0.01, 1, "potion healing");
  finite(config.roomRestHeal, 0, 1, "rest healing");

  finite(
    config.solo?.enemyHealthMultiplier,
    0.01,
    2,
    "solo enemy health multiplier"
  );

  finite(
    config.solo?.enemyAttackMultiplier,
    0.01,
    2,
    "solo enemy attack multiplier"
  );

  finite(
    config.solo?.rewardMultiplier,
    0.01,
    1,
    "solo reward multiplier"
  );

  if (
    !config.difficulties ||
    !Object.keys(config.difficulties).length
  ) {
    fail("No dungeons configured.");
  }

  for (const dungeon of Object.values(config.difficulties)) {
    if (
      !dungeon.name ||
      !Number.isSafeInteger(dungeon.reward) ||
      dungeon.reward < 1 ||
      dungeon.reward > combat.maxClearReward
    ) {
      fail("Invalid dungeon reward.");
    }

    if (
      !Array.isArray(dungeon.rooms) ||
      dungeon.rooms.length !== combat.roomsPerDungeon
    ) {
      fail(
        `Each dungeon needs ${combat.roomsPerDungeon} rooms.`
      );
    }

    for (const room of dungeon.rooms) {
      if (!room.name) fail("Enemy name is missing.");

      for (const field of [
        "health",
        "attack",
        "defense",
        "speed",
      ]) {
        finite(
          room[field],
          field === "defense" ? 0 : 1,
          combat.maxEnemyStat,
          `enemy ${field}`
        );
      }
    }
  }
}

export function dungeonForParty(dungeon, partySize, config) {
  if (![1, 2].includes(partySize)) {
    fail("Dungeons require one or two players.");
  }

  const result = structuredClone(dungeon);

  if (partySize === 1) {
    result.reward = Math.max(
      1,
      Math.floor(result.reward * config.solo.rewardMultiplier)
    );

    result.rooms = result.rooms.map((room) => ({
      ...room,
      health: Math.max(
        1,
        Math.round(
          room.health * config.solo.enemyHealthMultiplier
        )
      ),
      attack: Math.max(
        1,
        Math.round(
          room.attack * config.solo.enemyAttackMultiplier
        )
      ),
    }));
  }

  return result;
}

export function startState(dungeon, players, config) {
  const combat = resolveCombatConfig(config.combat ?? {});

  const rules = {
    ...structuredClone(config),
    combat,
    skillRules: structuredClone(ACTIVE_SKILLS),
  };

  if (
    ![1, 2].includes(players.length) ||
    new Set(players.map((player) => player.userId)).size !==
    players.length
  ) {
    fail("Use one or two different players.");
  }

  return {
    version: 1,
    mode: players.length === 1 ? "solo" : "coop",
    status: "active",
    dungeon: structuredClone(dungeon),
    rules,
    players,
    room: 0,
    round: 1,
    roomRound: 1,
    enemy: enemyFor(dungeon.rooms[0], combat),
    log: [
      players.length === 1
        ? "You entered the dungeon. Choose your first action."
        : "The party entered the dungeon. Lock in your first actions.",
    ],
  };
}

export function validateChoice(player, choice) {
  if (player.hp <= 0) {
    fail("You are knocked out and cannot choose an action.");
  }

  if (player.choice) {
    fail("Your action is already locked for this round.");
  }

  if (!["attack", "defend", "skill", "heal"].includes(choice)) {
    fail("Unknown combat action.");
  }

  if (
    choice === "skill" &&
    (!player.skill || player.skillCooldown > 0)
  ) {
    fail("Your weapon skill is unavailable or cooling down.");
  }

  if (
    choice === "heal" &&
    (player.potions <= 0 || player.hp >= player.maxHealth)
  ) {
    fail(
      "You need missing health and an available potion to heal."
    );
  }
}

export function resolveRound(input, rng = randomInt) {
  const state = structuredClone(input);

  const combat = state.rules.combat
    ? resolveCombatConfig(state.rules.combat, LEGACY_COMBAT)
    : { ...LEGACY_COMBAT };

  const skillRules =
    state.rules.skillRules ?? ACTIVE_SKILLS;

  const varianceWidth = Number(
    (
      combat.damageVarianceMax -
      combat.damageVarianceMin
    ).toPrecision(15)
  );

  const variance = () =>
    combat.damageVarianceMin + chance(rng) * varianceWidth;

  const armorReduction = (defense) =>
    Math.min(
      combat.maxArmorReduction,
      defense / (defense + combat.armorConstant)
    );

  const enemy = state.enemy;

  const alive = state.players.filter(
    (player) => player.hp > 0
  );

  if (
    !alive.length ||
    alive.some((player) => !player.choice)
  ) {
    fail("The round is not ready.");
  }

  const log = [];

  const order = [
    ...alive.map((player, index) => ({
      player,
      index,
      speed:
        player.speed +
        (
          player.choice === "skill"
            ? skillRules[player.skill]?.priorityBonus ?? 0
            : 0
        ),
    })),
    {
      enemy: true,
      speed: enemy.speed,
      index: alive.length,
    },
  ].sort(
    (a, b) => b.speed - a.speed || a.index - b.index
  );

  for (const actor of order) {
    if (enemy.hp <= 0) break;

    if (actor.enemy) {
      const targets = state.players.filter(
        (player) => player.hp > 0
      );

      if (!targets.length) break;

      const target = targets[
        Math.floor(chance(rng) * targets.length)
      ];

      const reduction = armorReduction(target.defense);

      let damage =
        enemy.attack *
        combat.enemyDamageMultiplier *
        variance() *
        (1 - reduction);

      if (enemy.weakAttacks > 0) {
        damage *=
          enemy.weakMultiplier ??
          combat.defaultWeakMultiplier;

        enemy.weakAttacks -= 1;
      }

      if (target.choice === "defend") {
        damage *= combat.defendDamageMultiplier;
      }

      damage *= target.passive?.damageMultiplier ?? 1;

      if (target.exposedUntil >= state.round) {
        damage *= combat.exposureDamageMultiplier;
      }

      damage = Math.max(
        combat.minimumDamage,
        Math.round(damage)
      );

      const absorbed = Math.min(
        target.shield ?? 0,
        damage
      );

      target.shield = Math.max(
        0,
        (target.shield ?? 0) - absorbed
      );

      const before = target.hp;
      const hpDamage = damage - absorbed;

      if (
        hpDamage >= target.hp &&
        (target.lethalSaves ?? 0) > 0
      ) {
        target.hp = 1;
        target.lethalSaves -= 1;

        log.push(
          `<@${target.userId}>'s Nine Lives prevented a knockout!`
        );
      } else {
        target.hp = Math.max(0, target.hp - hpDamage);
      }

      const actualLoss = before - target.hp;

      if (absorbed) {
        log.push(
          `<@${target.userId}>'s shield absorbed ${absorbed} damage.`
        );
      }

      log.push(
        `${enemy.name} hit <@${target.userId}> for ${actualLoss}` +
        (target.hp === 0 ? " — knocked out!" : ".")
      );

      if (
        actualLoss > 0 &&
        target.passive?.reflectRatio
      ) {
        const reflected = Math.max(
          combat.minimumReflectDamage,
          Math.floor(
            actualLoss * target.passive.reflectRatio
          )
        );

        enemy.hp = Math.max(0, enemy.hp - reflected);

        log.push(
          `Thornfur reflected ${reflected} damage.`
        );
      }

      continue;
    }

    const player = actor.player;
    if (player.hp <= 0) continue;

    if (player.choice === "defend") {
      const reduction = Math.round(
        (1 - combat.defendDamageMultiplier) * 100
      );

      log.push(
        `<@${player.userId}> guarded: incoming damage is ` +
        `reduced by ${reduction}% this round.`
      );

      continue;
    }

    if (player.choice === "heal") {
      const healed = Math.min(
        player.maxHealth - player.hp,
        Math.ceil(
          player.maxHealth * state.rules.potionHeal
        )
      );

      player.hp += healed;
      player.potions -= 1;

      log.push(
        `<@${player.userId}> used a potion and recovered ${healed} HP.`
      );

      continue;
    }

    const skill = player.choice === "skill"
      ? skillRules[player.skill]
      : null;

    if (skill?.healRatio) {
      const target = state.players
        .filter((member) => member.hp > 0)
        .sort(
          (a, b) =>
            a.hp / a.maxHealth -
            b.hp / b.maxHealth
        )[0];

      const healed = Math.min(
        target.maxHealth - target.hp,
        Math.ceil(target.maxHealth * skill.healRatio)
      );

      target.hp += healed;
      player.skillCooldown = skill.cooldown + 1;

      log.push(
        `<@${player.userId}> used ${skill.name}: ` +
        `<@${target.userId}> recovered ${healed} HP.`
      );

      continue;
    }

    if (skill?.shieldRatio) {
      const shield = Math.ceil(
        player.maxHealth * skill.shieldRatio
      );

      player.shield = Math.max(
        player.shield ?? 0,
        shield
      );

      log.push(
        `<@${player.userId}> gained a ${shield}-HP Moonlit Ward.`
      );
    }

    if (skill?.exposedRounds) {
      player.exposedUntil =
        state.round + skill.exposedRounds - 1;
    }

    const critical = skill?.canCrit === false
      ? false
      : chance(rng) < Math.min(
        1,
        player.critChance + (skill?.critBonus ?? 0)
      );

    const defense =
      enemy.defense *
      (
        enemy.armorBreakUntil >= state.round
          ? combat.armorBreakDefenseMultiplier
          : 1
      ) *
      (1 - (skill?.armorPierce ?? 0));

    const reduction = armorReduction(defense);

    const buff = (player.attackBuffTurns ?? 0) > 0
      ? player.attackBuffMultiplier
      : 1;

    const damage = Math.max(
      combat.minimumDamage,
      Math.round(
        player.attack *
        combat.playerDamageMultiplier *
        buff *
        variance() *
        (skill?.multiplier ?? 1) *
        (critical ? combat.criticalDamageMultiplier : 1) *
        (1 - reduction)
      )
    );

    const actualDamage = Math.min(enemy.hp, damage);
    enemy.hp = Math.max(0, enemy.hp - damage);

    if ((player.attackBuffTurns ?? 0) > 0) {
      player.attackBuffTurns -= 1;
    }

    log.push(
      `<@${player.userId}> used ${skill?.name ?? "Attack"}: ` +
      `${damage} damage${critical ? " (critical)" : ""}.`
    );

    if (skill) {
      player.skillCooldown = skill.cooldown + 1;

      if (skill.weakenAttacks) {
        enemy.weakMultiplier = enemy.weakAttacks > 0
          ? Math.min(
            enemy.weakMultiplier ??
            combat.defaultWeakMultiplier,
            skill.weakenMultiplier
          )
          : skill.weakenMultiplier;

        enemy.weakAttacks = Math.max(
          enemy.weakAttacks,
          skill.weakenAttacks
        );
      }

      if (skill.bleedRounds) {
        enemy.bleedDamage = Math.max(
          combat.minimumBleedDamage,
          Math.floor(
            player.attack * combat.bleedAttackRatio
          )
        );

        enemy.bleedUntil =
          state.round + skill.bleedRounds - 1;
      }

      if (skill.armorBreakRounds) {
        enemy.armorBreakUntil =
          state.round + skill.armorBreakRounds - 1;
      }

      if (skill.lifestealRatio) {
        const healed = Math.min(
          player.maxHealth - player.hp,
          Math.floor(actualDamage * skill.lifestealRatio)
        );

        player.hp += healed;

        if (healed) {
          log.push(
            `${skill.name} restored ${healed} HP ` +
            `to <@${player.userId}>.`
          );
        }
      }

      if (skill.attackBuffTurns) {
        player.attackBuffTurns = skill.attackBuffTurns;
        player.attackBuffMultiplier =
          skill.attackBuffMultiplier;
      }
    }
  }

  if (
    enemy.hp > 0 &&
    enemy.bleedUntil >= state.round
  ) {
    enemy.hp = Math.max(
      0,
      enemy.hp - enemy.bleedDamage
    );

    log.push(
      `Bleeding dealt ${enemy.bleedDamage} damage.`
    );
  }

  for (const player of state.players) {
    if (
      player.hp > 0 &&
      player.passive?.regenRatio &&
      player.hp < player.maxHealth
    ) {
      const healed = Math.min(
        player.maxHealth - player.hp,
        Math.ceil(
          player.maxHealth * player.passive.regenRatio
        )
      );

      player.hp += healed;

      log.push(
        `Soft Purr restored ${healed} HP to <@${player.userId}>.`
      );
    }

    player.choice = null;

    player.skillCooldown = Math.max(
      0,
      player.skillCooldown - 1
    );
  }

  if (state.players.every((player) => player.hp <= 0)) {
    state.status = "lost";

    log.push(
      state.players.length === 1
        ? "You were defeated. No clear reward was earned."
        : "The party was defeated. No clear reward was earned."
    );
  } else if (enemy.hp <= 0) {
    log.push(`${enemy.name} was defeated!`);
    state.room += 1;

    if (state.room === state.dungeon.rooms.length) {
      state.status = "won";

      log.push(
        state.players.length === 1
          ? "Dungeon cleared! Claim your reward."
          : "Dungeon cleared! Each player can claim their reward."
      );
    } else {
      for (const player of state.players) {
        if (player.hp > 0) {
          player.hp = Math.min(
            player.maxHealth,
            player.hp +
            Math.ceil(
              player.maxHealth * state.rules.roomRestHeal
            )
          );
        }
      }

      state.enemy = enemyFor(
        state.dungeon.rooms[state.room],
        combat
      );

      state.roomRound = 1;

      log.push(
        "Surviving players recovered " +
        `${Math.round(state.rules.roomRestHeal * 100)}% ` +
        "max HP during the rest."
      );
    }
  } else if (
    state.roomRound >= state.rules.maxRoundsPerRoom
  ) {
    state.status = "lost";

    log.push(
      "The room's round limit was reached. No clear reward was earned."
    );
  } else {
    state.roomRound += 1;
  }

  state.round += 1;
  state.log = log.slice(-combat.maxLogEntries);

  return state;
}