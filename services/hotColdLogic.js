import { drawFlower } from "./flowerPokerLogic.js";

const hot = new Set(["red", "yellow", "orange"]);
const cold = new Set(["purple", "assorted", "blue"]);

export function resolveHotCold(choice, draw = drawFlower) {
  if (!["hot", "cold"].includes(choice)) throw new Error("Choose hot or cold.");

  // A black flower repeats the SAME wager; it never deducts another stake.
  for (let replants = 0; replants < 1000; replants++) {
    const flower = draw();
    if (flower === "black") continue;
    if (flower === "white") {
      return { flower, replants, multiplier: 3, reason: "White flower jackpot!" };
    }
    if (flower === "mixed") {
      return { flower, replants, multiplier: 0, reason: "Mixed flower: you lose." };
    }
    const temperature = hot.has(flower) ? "hot" : cold.has(flower) ? "cold" : null;
    if (!temperature) throw new Error("Unknown flower result.");
    const won = choice === temperature;
    return {
      flower, replants, temperature,
      multiplier: won ? 2 : 0,
      reason: won ? `It's ${temperature}! You win!` : `It's ${temperature}. You lose.`,
    };
  }
  // Defensive limit: an impossible-length replant sequence cancels the transaction.
  throw new Error("Too many replants. The wager was canceled.");
}
