// Edit these settings, then restart the bot.
// Changes apply to new dungeon runs.
// Percentages use fractions: 0.65 = 65%.

export const dungeonCombat = {
    // Starting stats before equipment.
    baseHealth: 100,
    baseAttack: 8,
    baseSpeed: 10,
    minimumSpeed: 1,
    defaultCritChance: 0.05,

    // Overall damage scaling.
    playerDamageMultiplier: 1,
    enemyDamageMultiplier: 1,

    // Random damage range: 90%–110%.
    damageVarianceMin: 0.9,
    damageVarianceMax: 1.1,

    // Critical hits deal 150% damage.
    criticalDamageMultiplier: 1.5,

    // Minimum attack damage before shields.
    minimumDamage: 1,

    // Armor reduction:
    // defense / (defense + armorConstant)
    // Then capped by maxArmorReduction.
    armorConstant: 100,
    maxArmorReduction: 0.65,

    // Defending takes 50% of normal incoming damage.
    defendDamageMultiplier: 0.5,

    // Status effects.
    exposureDamageMultiplier: 1.2,
    armorBreakDefenseMultiplier: 0.75,

    // Fallback for older weakened-enemy states.
    // Individual skills define their own weaken multiplier.
    defaultWeakMultiplier: 0.75,

    bleedAttackRatio: 0.2,
    minimumBleedDamage: 2,
    minimumReflectDamage: 1,

    // Validation limits.
    // These do not automatically increase equipment/enemy stats.
    maxGearStat: 10_000,
    maxArmorHealthBonus: 10_000,
    speedBonusLimit: 100,
    maxEnemyStat: 1_000_000,
    maxClearReward: 1_000_000,

    // Must match each difficulty's room count.
    roomsPerDungeon: 3,

    // Saved combat log size.
    maxLogEntries: 8,
};

// Fallbacks for equipment missing dungeon metadata.
// Actual item.dungeon properties take precedence.
export const dungeonEquipmentDefaults = {
    feather: {
        speedBonus: 5,
        critChance: 0.05,
        ability: { id: "distracting-bonk" },
    },
    "rusty-shank": {
        speedBonus: 3,
        critChance: 0.15,
        ability: { id: "dirty-cut" },
    },
    "beer-bottle": {
        speedBonus: 0,
        critChance: 0.10,
        ability: { id: "bottle-smash" },
    },
    "cookie-cannon": {
        speedBonus: -3,
        critChance: 0.10,
        ability: { id: "cookie-barrage" },
    },
    "woolen-kitten-hood": {
        healthBonus: 10,
        speedBonus: 3,
    },
    "padded-pants": {
        healthBonus: 25,
        speedBonus: 1,
    },
    "chainmail-shirt": {
        healthBonus: 45,
        speedBonus: -2,
    },
    "bulletproof-vest": {
        healthBonus: 70,
        speedBonus: -5,
    },
};