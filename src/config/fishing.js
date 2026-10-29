export const fishingConfig = {
  cooldownMs: 2 * 60 * 1000,
  // Integer weights total 10,000. One fish per successful cast.
  // Values are fixed sale prices in your existing bot currency.

// Weights total 10,000.
  // Chance percentage = weight / 100.
  fish: [
    {
      id: "minnow",
      name: "Pond Minnow",
      emoji: "🐟",
      rarity: "Common",
      weight: 3000, // 30%
      sellValue: 50,
    },
    {
      id: "perch",
      name: "River Perch",
      emoji: "🐟",
      rarity: "Uncommon",
      weight: 2200, // 22%
      sellValue: 100,
    },
    {
      id: "bluegill",
      name: "Silver Bluegill",
      emoji: "🐟",
      rarity: "Uncommon",
      weight: 1600, // 16%
      sellValue: 200,
    },
    {
      id: "carp",
      name: "Copper Carp",
      emoji: "🐟",
      rarity: "Uncommon",
      weight: 1100, // 11%
      sellValue: 750,
    },
    {
      id: "bass",
      name: "Moonlit Bass",
      emoji: "🐠",
      rarity: "Rare",
      weight: 800, // 8%
      sellValue: 1000,
    },
    {
      id: "trout",
      name: "Glacier Trout",
      emoji: "🐟",
      rarity: "Rare",
      weight: 500, // 5%
      sellValue: 1500,
    },
    {
      id: "salmon",
      name: "Amber Salmon",
      emoji: "🎏",
      rarity: "Epic",
      weight: 350, // 3.5%
      sellValue: 2500,
    },
    {
      id: "koi",
      name: "Prismatic Koi",
      emoji: "🐟",
      rarity: "Epic",
      weight: 220, // 2.2%
      sellValue: 4500,
    },
    {
      id: "swordfish",
      name: "Storm Swordfish",
      emoji: "🐠",
      rarity: "Epic",
      weight: 130, // 1.3%
      sellValue: 10000,
    },
    {
      id: "golden",
      name: "Golden Arowana",
      emoji: "✨",
      rarity: "Legendary",
      weight: 70, // 0.7%
      sellValue: 20000,
    },
    {
      id: "moonray",
      name: "Celestial Moonray",
      emoji: "🌙",
      rarity: "Legendary",
      weight: 20, // 0.2%
      sellValue: 30000,
    },
    {
      id: "shark",
      name: "Kraken Shark",
      emoji: "🦈",
      rarity: "Legendary",
      weight: 7, // 0.07%
      sellValue: 45000,
    },
    {
      id: "dragon",
      name: "Ancient Dragonfish",
      emoji: "🐉",
      rarity: "Mythic",
      weight: 3, // 0.03%
      sellValue: 100000,
    },
  ],
};
