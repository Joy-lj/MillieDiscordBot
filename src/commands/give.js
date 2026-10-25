import { PermissionFlagsBits } from "discord.js";
import { giveCoins } from "../database/accounts.js";
import { economyConfig } from "../config/economy.js";

const adminID = ['428738370022277121', '813870343767982100'];
 

export async function giveCommand(message) {
  if (!message.inGuild()) return;

  // Only server administrators can use this command.
  if (!adminID.includes(message.author.id)) {
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
    await message.reply("Usage: `!give @user amount` — example: `!give @Victor 500`");
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

  let result;

    try {
    result = giveCoins(message.guildId, target.id, amount);
    console.log("giveCoins result:", result);
    } catch (error) {
    console.error("Failed to give coins:", error);

    await message.reply(
        "❌ Couldn't update the balance. Check the bot's terminal for the error."
    );

    return;
    }

  if (!result.success) {
    await message.reply("❌ That would exceed the maximum supported balance.");
    return;
  }

  await message.reply({
    content:
      `✅ Added **${amount.toLocaleString("en-US")} ${economyConfig.currencyName}** to <@${target.id}>.\n` +
      `${economyConfig.currencyEmoji} Their balance is now **${result.balance.toLocaleString("en-US")} ${economyConfig.currencyName}**.`,
    allowedMentions: { parse: [], repliedUser: false },
  });
}