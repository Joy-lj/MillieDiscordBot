import { startBet } from "../database/bets.js";
import { resolveWager } from "../utils/resolveWager.js";
import { diceGame } from "./dice.js";
import { blackjackGame } from "./blackjack.js";

const games = {
  "!dice": diceGame,
  "!blackjack": blackjackGame,
  "!bj": blackjackGame,
};

export async function betCommand(message) {
  if (!message.inGuild() || message.author.bot) return;

  const args = message.content.trim().split(/\s+/);
  const command = args[0].toLowerCase();

  if (!Object.hasOwn(games, command)) return;

  if (args.length !== 2) {
    return message.reply(
      `Usage: \`${command} <amount|all>\`\n` +
      `Examples: \`${command} 100\` or \`${command} all\``
    );
  }

  let bet;

  try {
    const parsed = await resolveWager(message, args[1]);

    if (parsed.error) {
      return message.reply(parsed.error);
    }

    bet = await startBet(
      message.guildId,
      message.author.id,
      parsed.wager
    );
  } catch (error) {
    console.error("Could not confirm wager:", error);

    return message.reply(
      "❌ Couldn't confirm your wager. Check your balance before trying again."
    );
  }

  if (bet.error) {
    return message.reply(`❌ ${bet.error}`);
  }

  try {
    await games[command](message, bet);
  } catch (error) {
    console.error("Bet game failed:", error);

    // Blackjack may have reserved extra wagers through split/double.
    // Refunding the original bet.wager here could refund too little.
    // Let the existing interrupted-game recovery refund the saved wager.
    await message.reply(
      "❌ The game was interrupted. Your wager may still be reserved. " +
      "Ask an administrator to check the bot log."
    ).catch(console.error);
  }
}