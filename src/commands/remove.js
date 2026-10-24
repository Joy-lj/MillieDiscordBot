import { PermissionFlagsBits } from "discord.js";
import { removeCoins } from "../database/accounts.js";
import { economyConfig } from "../config/economy.js";

export async function removeCommand(message) {
  if (!message.inGuild()) return;

  if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
    await message.reply("❌ Only administrators can use this command.");
    return;
  }

  const args = message.content.trim().split(/\s+/);
  const mention = args[1]?.match(/^<@!?(\d+)>$/);
  const amountText = args[2];

  if (
    args.length !== 3 ||
    !mention ||
    !/^\d+$/.test(amountText ?? "")
  ) {
    await message.reply(
      "Usage: `!remove @user amount` — example: `!remove @Victor 100`"
    );
    return;
  }

  const target = message.mentions.users.get(mention[1]);
  const amount = Number(amountText);

  if (!target) {
    await message.reply("❌ Please mention a valid user.");
    return;
  }

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    await message.reply("❌ Enter a positive whole number within the safe limit.");
    return;
  }

  const { currencyName, currencyEmoji } = economyConfig;
  const result = removeCoins(message.guildId, target.id, amount);

  if (!result.success) {
    await message.reply(
      `❌ That user doesn't have enough ${currencyName}.`
    );
    return;
  }

  await message.reply({
    content:
      `✅ Removed **${amount.toLocaleString("en-US")} ${currencyName}** from <@${target.id}>.\n` +
      `${currencyEmoji} Their balance is now **${result.balance.toLocaleString("en-US")} ${currencyName}**.`,
    allowedMentions: { parse: [], repliedUser: false },
  });
}