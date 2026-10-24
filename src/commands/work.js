import { claimWork } from "../database/accounts.js";
import { economyConfig } from "../config/economy.js";

export async function workCommand(message) {
  if (!message.inGuild()) return;

  const result = claimWork(message.guildId, message.author.id);
  const { currencyName, currencyEmoji } = economyConfig;

  if (!result.success) {
    if (result.reason === "cooldown") {
      const timestamp = Math.ceil(result.nextWorkAt / 1000);

      await message.reply(
        `⏳ You're resting after your shift! Work again <t:${timestamp}:R>.`
      );
    } else {
      await message.reply(
        "❌ Your balance is too high to receive this reward."
      );
    }

    return;
  }

  await message.reply(
    `💼 ${result.message}\n` +
    `${currencyEmoji} You earned **${result.reward} ${currencyName}**!\n` +
    `Your balance is now **${result.balance.toLocaleString("en-US")} ${currencyName}**.`
  );
}