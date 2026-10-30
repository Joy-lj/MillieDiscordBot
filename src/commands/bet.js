import { startBet, settleBet } from "../database/bets.js";
import { diceGame } from "./dice.js";
import { blackjackGame } from "./blackjack.js";

export async function betCommand(message) {
  if (!message.inGuild()) return;

  const args = message.content.trim().split(/\s+/);
  const command = args[0].toLowerCase();
  const amountText = args[1];

  const games = {
    "!dice": diceGame,
    "!blackjack": blackjackGame,
    "!bj": blackjackGame,
  };

  const playGame = games[command];

  if (!playGame) return;

  if (
    args.length !== 2 ||
    !/^\d+$/.test(amountText ?? "")
  ) {
    await message.reply(`Usage: \`${command} 100\``);
    return;
  }

  const bet = await startBet(
    message.guildId,
    message.author.id,
    Number(amountText)
  );

  if (bet.error) {
    await message.reply(`❌ ${bet.error}`);
    return;
  }

  try {
    await playGame(message, bet);
  } catch (error) {
    console.error("Bet game failed:", error);

    // Refund only if the game hasn't already settled.
    const refundedBalance = await settleBet(bet.id, bet.wager);

    if (refundedBalance !== null) {
      await message.reply(
        "❌ The game was interrupted. Your wager was refunded."
      ).catch(console.error);
    }
  }
}