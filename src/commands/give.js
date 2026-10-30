import { giveCoins } from "../database/accounts.js";
import { economyConfig } from "../config/economy.js";

const adminIDs = new Set([
  "428738370022277121",
  "813870343767982100",
]);

export async function giveCommand(message) {
  if (!message.inGuild() || message.author.bot) return;

  if (!adminIDs.has(message.author.id)) {
    await message.reply("❌ Only authorized administrators can use this command.");
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
      "Usage: `!give @user amount` — example: `!give @Victor 500`"
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
    result = await giveCoins(message.guildId, target.id, amount);
  } catch (error) {
    console.error("Failed to give coins:", error);

    await message.reply(
      "❌ Couldn't confirm the balance update. Check the balance and bot log before trying again."
    );
    return;
  }

  if (!result.success) {
    await message.reply(
      "❌ That would exceed the maximum supported balance."
    );
    return;
  }

  const money = (value) =>
    `${value.toLocaleString("en-US")} ${economyConfig.currencyName}`;

  await message.reply({
    content:
      `✅ Added **${money(amount)}** to <@${target.id}>.\n` +
      `${economyConfig.currencyEmoji ?? ""} Their balance is now ` +
      `**${money(result.balance)}**.`,
    allowedMentions: { parse: [], repliedUser: false },
  });
}