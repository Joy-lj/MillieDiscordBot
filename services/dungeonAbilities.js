// One source for item descriptions and the dungeon engine's actual effects.
const definitions = {
  flutter: {
    id: "feather-flutter", name: "Distracting Flutter", cooldownTurns: 2,
    description: "One 65% damage hit at 88% accuracy. A landed hit weakens the enemy's next attack by 10%.",
    multiplier: 0.65, hits: 1, accuracy: 0.88, weakenMultiplier: 0.90, weakenAttacks: 1,
  },
  tangle: {
    id: "yarn-tangle", name: "Tangled Bonk", cooldownTurns: 2,
    description: "One 95% damage hit at 92% accuracy. A landed hit weakens the enemy's next attack by 20%.",
    multiplier: 0.95, hits: 1, accuracy: 0.92, weakenMultiplier: 0.80, weakenAttacks: 1,
  },
  doubleSlash: {
    id: "nightfall-double-slash", name: "Nightfall Double Slash", cooldownTurns: 1,
    description: "Two independent 70% damage hits at 94% accuracy each. Each gains +5 percentage points crit chance; critical hits deal 165% damage. One-round cooldown.",
    multiplier: 0.70, hits: 2, accuracy: 0.94, critBonus: 0.05, critDamageMultiplier: 1.65,
  },
  twinFang: {
    id: "tombfang-rend", name: "Twin Fang Rend", cooldownTurns: 2,
    description: "Two 75% damage hits at 96% accuracy each, +5 percentage points crit chance and 170% critical damage. A landed hit causes 2 bleed ticks of 8% ATK (minimum 2 each), starting this round.",
    multiplier: 0.75, hits: 2, accuracy: 0.96, critBonus: 0.05, critDamageMultiplier: 1.70,
    bleedRounds: 2, bleedAttackRatio: 0.08,
  },
  cannonade: {
    id: "crumb-cannonade", name: "Crumb Cannonade", cooldownTurns: 3,
    description: "Three 75% damage hits at 96% accuracy each, ignoring 15% defense. Each gains +5 percentage points crit chance and deals 165% critical damage.",
    multiplier: 0.75, hits: 3, accuracy: 0.96, armorPierce: 0.15, critBonus: 0.05, critDamageMultiplier: 1.65,
  },
  cryptFeast: {
    id: "cryptclaw-feast", name: "Cryptclaw Feast", cooldownTurns: 2,
    description: "Two 100% damage hits at 97% accuracy each. Gain +10 percentage points crit chance and 180% critical damage; heal for 25% of HP actually removed across both hits.",
    multiplier: 1, hits: 2, accuracy: 0.97, critBonus: 0.10, critDamageMultiplier: 1.80, lifestealRatio: 0.25,
  },
  starFlurry: {
    id: "starfall-flurry", name: "Starfall Flurry", cooldownTurns: 3,
    description: "Four 70% damage hits at 98% accuracy each, ignoring 15% defense. Each gains +15 percentage points crit chance and deals 190% critical damage.",
    multiplier: 0.70, hits: 4, accuracy: 0.98, critBonus: 0.15, critDamageMultiplier: 1.90, armorPierce: 0.15,
  },
  abyssalReap: {
    id: "abyssal-reaping", name: "Abyssal Reaping", cooldownTurns: 3,
    description: "Two guaranteed 140% damage hits, ignoring 45% defense. Each gains +10 percentage points crit chance and deals 180% critical damage.",
    multiplier: 1.40, hits: 2, accuracy: 1, armorPierce: 0.45, critBonus: 0.10, critDamageMultiplier: 1.80,
  },
  eclipseExecution: {
    id: "eclipse-execution", name: "Eclipse Execution", cooldownTurns: 4,
    description: "One guaranteed 340% damage hit, ignoring 50% defense. Gain +10 percentage points crit chance; a critical hit deals 200% damage.",
    multiplier: 3.40, hits: 1, accuracy: 1, armorPierce: 0.50, critBonus: 0.10, critDamageMultiplier: 2,
  },
  royalFury: {
    id: "royal-annihilation", name: "Royal Annihilation", cooldownTurns: 4,
    description: "Two guaranteed 180% damage hits, ignoring 35% defense. Each gains +20 percentage points crit chance and deals 210% critical damage.",
    multiplier: 1.80, hits: 2, accuracy: 1, armorPierce: 0.35, critBonus: 0.20, critDamageMultiplier: 2.10,
  },
  eternalFury: {
    id: "eternal-cataclysm", name: "Eternal Cataclysm", cooldownTurns: 5,
    description: "Three guaranteed 140% damage hits, ignoring 45% defense. Each gains +25 percentage points crit chance and deals 220% critical damage. Your next 2 damaging actions gain +20% damage.",
    multiplier: 1.40, hits: 3, accuracy: 1, armorPierce: 0.45, critBonus: 0.25, critDamageMultiplier: 2.20,
    attackBuffTurns: 2, attackBuffMultiplier: 1.20,
  },
  // Keep old IDs/effects available for old catalogs and saved runs.
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
