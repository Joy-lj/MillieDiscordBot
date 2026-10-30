import { PermissionFlagsBits } from "discord.js";
import { removeCoins } from "../database/accounts.js";
import { economyConfig } from "../config/economy.js";

export async function removeCommand(message) {
  if (!message.inGuild() || message.author.bot) return;

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
    await message.reply(
      "❌ Enter a positive whole number within the safe limit."
    );
    return;
  }

  let result;

  try {
    result = await removeCoins(message.guildId, target.id, amount);
  } catch (error) {
    console.error("Failed to remove coins:", error);

    await message.reply(
      "❌ Couldn't confirm the balance update. Check the balance and bot log before trying again."
    );
    return;
  }

  const { currencyName, currencyEmoji } = economyConfig;

  if (!result.success) {
    await message.reply(
      `❌ That user doesn't have enough ${currencyName}.`
    );
    return;
  }

  const money = (value) =>
    `${value.toLocaleString("en-US")} ${currencyName}`;

  await message.reply({
    content:
      `✅ Removed **${money(amount)}** from <@${target.id}>.\n` +
      `${currencyEmoji ?? ""} Their balance is now **${money(result.balance)}**.`,
    allowedMentions: { parse: [], repliedUser: false },
  });
}