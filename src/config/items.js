export const BASE_ITEMS = {
  // Weapons (Strength stat)
  "foam-sword": {
    name: "Foam Sword",
    type: "weapon",
    stat: 5,
    price: 1500,
    description: "A harmless children's toy made of soft foam.",
    use: "Tickle opponents or practice swinging safely."
  },
  "rusty-shank": {
    name: "Rusty Shank",
    type: "weapon",
    stat: 12,
    price: 3000,
    description: "A jagged, tetanus-ridden piece of metal.",
    use: "Stab targets in close-quarters combat."
  },
  "beer-bottle": {
    name: "Beer Bottle",
    type: "weapon",
    stat: 20,
    price: 5000,
    description: "Half-empty glass bottle with a jagged edge.",
    use: "Smash over foes or drink when thirsty."
  },
  "gun": {
    name: "Gun",
    type: "weapon",
    stat: 100,
    price: 25000,
    description: "A standard firearm loaded with cookie shrapnel.",
    use: "Shoot targets from a distance."
  },

  // Armor (Defense stat)
  "bicycle-helmet": {
    name: "Bicycle Helmet",
    type: "armor",
    stat: 10,
    price: 2000,
    description: "A plastic helmet meant for safety on wheels.",
    use: "Protects your head from bumps and strikes."
  },
  "padded-pants": {
    name: "Padded Pants",
    type: "armor",
    stat: 25,
    price: 4000,
    description: "Thick cotton pants stuffed with old rags.",
    use: "Cushions falls and light blows."
  },
  "chainmail-shirt": {
    name: "Chainmail Shirt",
    type: "armor",
    stat: 60,
    price: 12000,
    description: "Interlocking metal rings woven together.",
    use: "Deflects sharp strikes and slashes."
  },
  "bulletproof-vest": {
    name: "Bulletproof Vest",
    type: "armor",
    stat: 150,
    price: 35000,
    description: "Heavy-duty Kevlar vest built for survival.",
    use: "Stops high-velocity impacts and heavy hits."
  }
};

const DUNGEON_STATS = {
  // Weapons
  "foam-sword": {
    tier: 1,
    rarity: "common",
    speedBonus: 5,
    critChance: 0.05,

    ability: {
      id: "distracting-bonk",
      name: "Distracting Bonk",
      description:
        "Deal normal damage and reduce the enemy's next attack by 25%.",
      cooldownTurns: 3,
    },
  },

  "rusty-shank": {
    tier: 2,
    rarity: "uncommon",
    speedBonus: 3,
    critChance: 0.15,

    ability: {
      id: "dirty-cut",
      name: "Dirty Cut",
      description:
        "Deal normal damage and apply bleeding for 2 rounds.",
      cooldownTurns: 3,
    },
  },

  "beer-bottle": {
    tier: 3,
    rarity: "rare",
    speedBonus: 0,
    critChance: 0.10,

    ability: {
      id: "bottle-smash",
      name: "Bottle Smash",
      description:
        "Deal 150% damage and weaken enemy defense for 2 rounds.",
      cooldownTurns: 3,
    },
  },

  gun: {
    tier: 4,
    rarity: "epic",
    speedBonus: -3,
    critChance: 0.10,

    ability: {
      id: "cookie-barrage",
      name: "Cookie Barrage",
      description:
        "Deal 175% damage to one enemy.",
      cooldownTurns: 4,
    },
  },

  // Armor
  "bicycle-helmet": {
    tier: 1,
    rarity: "common",
    healthBonus: 10,
    speedBonus: 3,
  },

  "padded-pants": {
    tier: 2,
    rarity: "uncommon",
    healthBonus: 25,
    speedBonus: 1,
  },

  "chainmail-shirt": {
    tier: 3,
    rarity: "rare",
    healthBonus: 45,
    speedBonus: -2,
  },

  "bulletproof-vest": {
    tier: 4,
    rarity: "epic",
    healthBonus: 70,
    speedBonus: -5,
  },
};


// Existing commands still import ITEMS normally.
export const ITEMS = Object.fromEntries(
  Object.entries(BASE_ITEMS).map(([id, item]) => [
    id,
    {
      ...item,
      dungeon: DUNGEON_STATS[id] ?? {},
    },
  ])
);