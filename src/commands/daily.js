import { claimDaily } from "../database/accounts.js";
import { economyConfig } from "../config/economy.js";

export async function dailyCommand(message) {
  if (!message.inGuild()) return;

  const result = claimDaily(message.guildId, message.author.id);

  if (!result.success) {
    // Discord timestamps use seconds, rather than milliseconds.
    const timestamp = Math.ceil(result.nextClaimAt / 1000);

    await message.reply(
      `⏳ You've already claimed your daily reward! Try again <t:${timestamp}:R>.`
    );

    return;
  }

  await message.reply(
    `🎁 You claimed **${result.reward} ${economyConfig.currencyName}**!\n` +
    `${economyConfig.currencyEmoji} Your balance is now **${result.balance.toLocaleString("en-US")} ${economyConfig.currencyName}**.`
  );
}