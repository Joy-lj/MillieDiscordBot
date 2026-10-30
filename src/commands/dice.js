import { randomInt } from "node:crypto";
import { settleBet } from "../database/bets.js";
import { economyConfig } from "../config/economy.js";

export async function diceGame(message, bet) {
  const roll = randomInt(1, 101);
  const won = roll >= 55;
  const payout = won ? bet.wager * 2 : 0;

  const balance = await settleBet(bet.id, payout);
  const { currencyName, currencyEmoji } = economyConfig;

  await message.reply({
    content:
      `🎲 You rolled **${roll}**!\n` +
      (
        won
          ? `✅ Won! Returned **${payout.toLocaleString("en-US")} ${currencyName}** ` +
          `(**+${bet.wager.toLocaleString("en-US")}** profit).\n`
          : `❌ Lost **${bet.wager.toLocaleString("en-US")} ${currencyName}**.\n`
      ) +
      `${currencyEmoji} Balance: **${balance.toLocaleString("en-US")} ${currencyName}**`,
    allowedMentions: { parse: [], repliedUser: false },
  });
} 