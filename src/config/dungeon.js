export const dungeonConfig = {
  inviteMs: 60_000,
  roundMs: 120_000,
  cooldownMs: 30 * 60 * 1000, // Default fallback: 30 minutes
  maxRoundsPerRoom: 15,
  potionsPerPlayer: 2,
  potionHeal: 0.35,
  roomRestHeal: 0.25,

  solo: {
    enemyHealthMultiplier: 0.6,
    enemyAttackMultiplier: 0.45,
    rewardMultiplier: 0.7,
  },

  difficulties: {
    easy: {
      name: "Dusty Catacombs",
      reward: 15000,
      cooldownMs: 30 * 60 * 1000, // 30 minutes

      rooms: [
        { name: "Dust Bunny", health: 90, attack: 16, defense: 4, speed: 8 },
        { name: "Cookie Bandit", health: 130, attack: 22, defense: 10, speed: 11 },
        { name: "Litter Golem", health: 190, attack: 30, defense: 18, speed: 6 },
      ],
    },

    normal: {
      name: "Midnight Pantry",
      reward: 45000,
      cooldownMs: 60 * 60 * 1000, // 1 hour

      rooms: [
        { name: "Pantry Warden", health: 280, attack: 35, defense: 22, speed: 12 },
        { name: "Sugar Specter", health: 380, attack: 45, defense: 30, speed: 14 },
        { name: "The Cookie Collector", health: 520, attack: 55, defense: 45, speed: 10 },
      ],
    },

    hard: {
      name: "Millie's Forbidden Vault",
      reward: 100000,
      cooldownMs: 2 * 60 * 60 * 1000, // 2 hours

      rooms: [
        { name: "Vault Sentinel", health: 650, attack: 55, defense: 60, speed: 16 },
        { name: "Shrapnel Cat", health: 850, attack: 65, defense: 75, speed: 18 },
        { name: "The Crumb King", health: 1100, attack: 100, defense: 90, speed: 14 },
      ],
    },
    ultra: {
      name: "Millie's Cosmic Cataclysm",
      reward: 300_000,
      cooldownMs: 12 * 60 * 60 * 1000, // 12 hours

      rooms: [
        {
          name: "Cosmic Gatekeeper",
          health: 1400,
          attack: 120,
          defense: 115,
          speed: 20,
        },
        {
          name: "Voidwhisker Devourer",
          health: 2200,
          attack: 180,
          defense: 150,
          speed: 24,
        },
        {
          name: "The Eternal Purr Sovereign",
          health: 3500,
          attack: 250,
          defense: 200,
          speed: 22,
        },
      ],
    },
  },
};