import { claimDaily } from "../database/accounts.js";
import { economyConfig } from "../config/economy.js";

export async function dailyCommand(message) {
  if (!message.inGuild()) return;

  const result = await claimDaily(message.guildId, message.author.id);
  const { currencyName, currencyEmoji } = economyConfig;

  if (!result.success) {
    const timestamp = Math.ceil(result.nextClaimAt / 1000);
    return message.reply(`⏳ You already claimed your daily reward! Claim again <t:${timestamp}:R>.`);
  }

  let replyText = `🎁 You claimed your daily reward and received **${result.reward} ${currencyName}**!`;
  if (result.dogMultiplierMessage) {
    replyText += result.dogMultiplierMessage;
  }
  replyText += `\nYour balance is now **${result.balance.toLocaleString("en-US")} ${currencyName}** ${currencyEmoji}.`;

  await message.reply(replyText);
}