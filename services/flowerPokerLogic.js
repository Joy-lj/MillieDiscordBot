import { randomInt } from "node:crypto";
import { flowers } from "../src/config/flowerPoker.js";

const totalWeight = flowers.reduce((sum, flower) => sum + 1 / flower.denominator, 0);
export const flowerProbabilities = flowers.map((flower) => ({
  id: flower.id,
  probability: (1 / flower.denominator) / totalWeight,
}));

// randomInt's upper bound is exclusive. No floating-point Math.random dependency.
export function drawFlower(randomUnit = () => randomInt(2 ** 32) / 2 ** 32) {
  const unit = randomUnit();
  if (!Number.isFinite(unit) || unit < 0 || unit >= 1) {
    throw new Error("Random draw must be in [0, 1).");
  }
  let roll = unit * totalWeight;
  for (const flower of flowers) {
    roll -= 1 / flower.denominator;
    if (roll < 0) return flower.id;
  }
  return flowers.at(-1).id;
}

export function plantHand() {
  return Array.from({ length: 5 }, () => drawFlower());
}

const ranks = {
  "1,1,1,1,1": { rank: 0, name: "No pair" },
  "2,1,1,1": { rank: 1, name: "One pair" },
  "2,2,1": { rank: 2, name: "Two pairs" },
  "3,1,1": { rank: 3, name: "Three of a kind" },
  "3,2": { rank: 4, name: "Full house" },
  "4,1": { rank: 5, name: "Four of a kind" },
  "5": { rank: 6, name: "Five of a kind" },
};

export function rankHand(hand) {
  if (
    hand.length !== 5 ||
    hand.some((id) => !flowers.some((flower) => flower.id === id))
  ) {
    throw new Error("A hand must contain five valid flowers.");
  }

  // Black or white overrides every normal hand ranking.
  if (hand.includes("black") || hand.includes("white")) {
    return {
      rank: -1,
      name: "Auto-loss (black/white flower)",
    };
  }

  const counts = new Map();

  for (const id of hand) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const pattern = [...counts.values()]
    .sort((a, b) => b - a)
    .join(",");

  return ranks[pattern];
}

// No color hierarchy, kickers, straights, flushes, or special black/white rule.
export function compareHands(first, second) {
  return Math.sign(rankHand(first).rank - rankHand(second).rank);
}
