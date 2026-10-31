// One source for item descriptions and the dungeon engine's actual effects.
const definitions = {
  bonk: {
    id: "distracting-bonk", name: "Playful Bonk", cooldownTurns: 3,
    description: "Deal normal damage and reduce the enemy's next attack by 25%.",
    multiplier: 1, weakenMultiplier: 0.75, weakenAttacks: 1,
  },
  bleed: {
    id: "dirty-cut", name: "Raking Claws", cooldownTurns: 3,
    description: "Deal normal damage and apply bleeding for 2 rounds.",
    multiplier: 1, bleedRounds: 2,
  },
  break: {
    id: "bottle-smash", name: "Clawbreaker", cooldownTurns: 3,
    description: "Deal 150% damage and reduce enemy defense by 25% for 2 rounds.",
    multiplier: 1.5, armorBreakRounds: 2,
  },
  barrage: {
    id: "cookie-barrage", name: "Cookie Cataclysm", cooldownTurns: 4,
    description: "Deal 175% damage to one enemy.", multiplier: 1.75,
  },
  pounce: {
    id: "quick-pounce", name: "Quick Pounce", cooldownTurns: 2,
    description: "Gain 20 initiative for this action; deal 110% damage with +15 percentage points critical chance.",
    multiplier: 1.1, priorityBonus: 20, critBonus: 0.15,
  },
  purr: {
    id: "soothing-purr", name: "Soothing Purr", cooldownTurns: 4,
    description: "Heal the living party member with the lowest health percentage for 25% of their maximum HP. Targets you in solo.",
    multiplier: 0, healRatio: 0.25,
  },
  siphon: {
    id: "fang-feast", name: "Fang Feast", cooldownTurns: 3,
    description: "Deal 120% damage and heal yourself for 30% of the actual damage dealt.",
    multiplier: 1.2, lifestealRatio: 0.30,
  },
  volley: {
    id: "fishbone-volley", name: "Fishbone Volley", cooldownTurns: 3,
    description: "Deal 140% damage, ignoring 50% of the enemy's remaining defense for this hit.",
    multiplier: 1.4, armorPierce: 0.5,
  },
  ward: {
    id: "moonlit-ward", name: "Moonlit Ward", cooldownTurns: 4,
    description: "Gain a shield worth 20% of your maximum HP, then deal 80% damage. Shields refresh rather than stack.",
    multiplier: 0.8, shieldRatio: 0.20,
  },
  frenzy: {
    id: "catnip-frenzy", name: "Catnip Frenzy", cooldownTurns: 4,
    description: "Deal 135% damage. Your next 2 damaging attacks gain +25% damage; take +20% enemy attack damage for this round and the next.",
    multiplier: 1.35, attackBuffTurns: 2, attackBuffMultiplier: 1.25, exposedRounds: 2,
  },
  roar: {
    id: "royal-roar", name: "Royal Roar", cooldownTurns: 4,
    description: "Deal 110% damage and weaken the enemy's next 2 attacks by 30%.",
    multiplier: 1.1, weakenMultiplier: 0.70, weakenAttacks: 2,
  },
  pawfall: {
    id: "celestial-pawfall", name: "Celestial Pawfall", cooldownTurns: 5,
    description: "Deal 225% damage in a colossal paw strike. This skill cannot critically hit.",
    multiplier: 2.25, canCrit: false,
  },
};

export const ABILITIES = Object.fromEntries(Object.entries(definitions).map(([key, value]) => [key, {
  id: value.id, name: value.name, cooldownTurns: value.cooldownTurns, description: value.description,
}]));

export const ACTIVE_SKILLS = Object.fromEntries(Object.values(definitions).map((value) => [value.id, {
  ...value, cooldown: value.cooldownTurns,
}]));

export const ARMOR_PASSIVES = {
  padding: {
    id: "padded-paws", name: "Padded Paws",
    description: "Start the run with a shield worth 15% of your maximum HP. It does not refill between rooms.",
    shieldRatio: 0.15,
  },
  thorns: {
    id: "thornfur", name: "Thornfur",
    description: "Reflect 15% of HP actually lost to enemy attacks, rounded down with a minimum of 1 when damaged.",
    reflectRatio: 0.15,
  },
  regen: {
    id: "soft-purr", name: "Soft Purr",
    description: "Recover 3% of your maximum HP at the end of each round while alive. Cannot revive you.",
    regenRatio: 0.03,
  },
  hunter: {
    id: "hunters-instinct", name: "Hunter's Instinct",
    description: "Gain +5 percentage points critical chance while equipped.",
    critBonus: 0.05,
  },
  fortify: {
    id: "iron-hide", name: "Iron Hide",
    description: "Take 10% less enemy attack damage after armor reduction. Minimum damage rules still apply.",
    damageMultiplier: 0.90,
  },
  nineLives: {
    id: "nine-lives", name: "Nine Lives",
    description: "Once per run, survive a lethal enemy attack with 1 HP. Does not reset between rooms.",
    lethalSaves: 1,
  },
};

export const PASSIVES_BY_ID = Object.fromEntries(Object.values(ARMOR_PASSIVES).map((value) => [value.id, value]));
