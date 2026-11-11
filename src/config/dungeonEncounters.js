// All mechanics and daily rosters live here. Base stats/rewards stay in dungeon.js.
const strike = () => ({ id: "strike", name: "Claw Strike", kind: "attack", target: "random", multiplier: 1 });
const slam = (name = "Crushing Pounce", multiplier = 2) => ({
  id: "slam", name, kind: "attack", target: "marked", multiplier, defendMultiplier: 0.2,
  hint: "The marked player should Defend.",
});
const sweep = (name = "Whisker Sweep", multiplier = 0.9) => ({
  id: "sweep", name, kind: "attack", target: "all", multiplier, defendMultiplier: 0.35,
  hint: "Everyone is targeted. Defend to reduce your own incoming damage.",
});
const mend = (ratio = 0.12) => ({
  id: "mend", name: "Forbidden Feast", kind: "heal", target: "self", healRatio: ratio,
  interruptible: true,
  hint: "Land a damaging weapon skill this round to interrupt the heal. Misses and healing skills do not interrupt. The channel acts after the party.",
});
const brace = () => ({
  id: "brace", name: "Ironfur Stance", kind: "attack", target: "random", multiplier: 0.6,
  incomingMultiplier: 0.35,
  hint: "The enemy is braced and makes a weak attack. Recover, Defend, or save your special.",
});

export const dungeonEncounters = {
  enabled: true,
  rotation: { intervalMs: 24 * 60 * 60 * 1000, epochMs: 0, seed: "millie-roster-v1" },
  profiles: {
    brawler: { name: "Heavy Hitter", pattern: [strike(), slam(), strike(), sweep()], enrage: { below: 0.3, multiplier: 1.25 } },
    mender: { name: "Forbidden Healer", pattern: [strike(), strike(), mend(), slam("Pantry Pulverizer", 1.8)], enrage: { below: 0.3, multiplier: 1.2 } },
    stalker: { name: "Marked Hunter", pattern: [strike(), slam("Shadow Pounce", 2.2), strike(), sweep("Fangstorm", 1)], enrage: { below: 0.35, multiplier: 1.3 } },
    bulwark: { name: "Armored Guardian", pattern: [strike(), brace(), slam("Vaultbreaker", 2.1), strike()], enrage: { below: 0.3, multiplier: 1.25 } },
    sovereign: { name: "Cosmic Sovereign", pattern: [strike(), sweep("Cosmic Collapse", 1.2), mend(0.1), brace(), slam("Eternal Pawfall", 2.4)], enrage: { below: 0.35, multiplier: 1.4 } },
    shadow: { name: "Cosmic Shadow", pattern: [strike(), slam("Void Ambush", 2.2), mend(0.15), sweep("Shadowfall", 1.3)], enrage: { below: 0.4, multiplier: 1.35 } },
    eclipse: { name: "Nine-Lived Eclipse", pattern: [brace(), sweep("Eclipse Wave", 1.15), strike(), mend(0.12), slam("Moonbreaker", 2.3)], enrage: { below: 0.35, multiplier: 1.4 } },
  },
  // Each inner list is one room slot. Stats come from that slot in dungeon.js.
  pools: {
    easy: [
      [{ name: "Dust Bunny", profile: "brawler" }, { name: "Sock Gremlin", profile: "stalker" }, { name: "Scratching Post Sprite", profile: "bulwark" }],
      [{ name: "Cookie Bandit", profile: "stalker" }, { name: "Milk-Tin Marauder", profile: "mender" }, { name: "Catnip Smuggler", profile: "brawler" }],
      [{ name: "Litter Golem", profile: "bulwark" }, { name: "King Dustball", profile: "brawler" }, { name: "The Hungry Hamper", profile: "mender" }],
    ],
    normal: [
      [{ name: "Pantry Warden", profile: "bulwark" }, { name: "Tin Can Templar", profile: "brawler" }, { name: "Midnight Mouser", profile: "stalker" }],
      [{ name: "Sugar Specter", profile: "mender" }, { name: "Velvetfang Prowler", profile: "stalker" }, { name: "Biscuit Berserker", profile: "brawler" }],
      [{ name: "The Cookie Collector", profile: "mender" }, { name: "Duchess of Crumbs", profile: "stalker" }, { name: "The Pantry Colossus", profile: "bulwark" }],
    ],
    hard: [
      [{ name: "Vault Sentinel", profile: "bulwark" }, { name: "Runefang Enforcer", profile: "brawler" }, { name: "The Silent Scratcher", profile: "stalker" }],
      [{ name: "Shrapnel Cat", profile: "stalker" }, { name: "Gilded Fur Alchemist", profile: "mender" }, { name: "The Iron Purrguard", profile: "bulwark" }],
      [{ name: "The Crumb King", profile: "brawler" }, { name: "Queen of the Locked Pantry", profile: "mender" }, { name: "The Royal Nightstalker", profile: "stalker" }],
    ],
    ultra: [
      [{ name: "Cosmic Gatekeeper", profile: "bulwark" }, { name: "Astral Fangwarden", profile: "stalker" }, { name: "The Star-Eating Sphinx", profile: "mender" }],
      [{ name: "Voidwhisker Devourer", profile: "stalker" }, { name: "The Nebula Purrmancer", profile: "mender" }, { name: "Constellation Colossus", profile: "bulwark" }],
      [{ name: "The Eternal Purr Sovereign", profile: "sovereign" }, { name: "Millie's Cosmic Shadow", profile: "shadow" }, { name: "The Nine-Lived Eclipse", profile: "eclipse" }],
    ],
  },
};
