// All chances are per trip. Basic materials ALWAYS drop; the rare roll is extra.
// Bonus table uses basis points: 100 = 1%, 25 = 0.25%, 1 = 0.01%.
export const gatheringConfig = {
  activities: {
    mine: {
      name: "Mining", emoji: "⛏️", color: 0x97a8bb,
      cooldownMs: 5 * 60_000,
      description: "Search Millie's crystal tunnels for scrap and celestial fragments.",
      basic: [
        { itemId: "catsteel-scrap", weight: 8500, min: 2, max: 5 },
        { itemId: "enchanted-fur", weight: 1500, min: 1, max: 3 },
      ],
      rare: [
        { itemId: "starforged-core", bps: 25 },
        { itemId: "eternal-cosmic-cat-orb", bps: 1 },
      ],
    },
    scavenge: {
      name: "Scavenging", emoji: "🔎", color: 0xc49a6c,
      cooldownMs: 10 * 60_000,
      description: "Explore forgotten catacombs for useful scraps and royal relics.",
      basic: [
        { itemId: "catsteel-scrap", weight: 5000, min: 2, max: 4 },
        { itemId: "enchanted-fur", weight: 5000, min: 2, max: 4 },
      ],
      rare: [
        { itemId: "royal-thread", bps: 50 },
        { itemId: "eternal-cosmic-cat-orb", bps: 1 },
      ],
    },
    hunt: {
      name: "Hunting", emoji: "🏹", color: 0x66ad7d,
      cooldownMs: 15 * 60_000,
      description: "Follow moonlit trails for enchanted fibers and elusive fangs.",
      basic: [
        { itemId: "enchanted-fur", weight: 9000, min: 3, max: 6 },
        { itemId: "catsteel-scrap", weight: 1000, min: 1, max: 3 },
      ],
      rare: [
        { itemId: "moonlit-fang", bps: 75 },
        { itemId: "eternal-cosmic-cat-orb", bps: 1 },
      ],
    },
  },
};
