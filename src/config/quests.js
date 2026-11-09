export const questConfig = {
  resetTimeZone: "America/New_York",
  definitions: [
    { id: "daily-work", period: "daily", name: "Clock In", metric: "work", target: 3, reward: 10_000 },
    { id: "daily-fish", period: "daily", name: "Fresh Catch", metric: "fish", target: 10, reward: 5_000 },
    { id: "daily-dungeon", period: "daily", name: "Dungeon Delver", metric: "dungeon", target: 1, reward: 20_000 },
    { id: "weekly-work", period: "weekly", name: "Hard Worker", metric: "work", target: 15, reward: 50_000 },
    { id: "weekly-fish", period: "weekly", name: "Gone Fishing", metric: "fish", target: 50, reward: 30_000 },
    { id: "weekly-dungeon", period: "weekly", name: "Catacomb Champion", metric: "dungeon", target: 5, reward: 100_000 },
  ],
};
