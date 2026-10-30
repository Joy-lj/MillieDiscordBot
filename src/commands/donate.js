import { donateCoins } from "../database/accounts.js";
import { economyConfig } from "../config/economy.js";

export async function donateCommand(message) {
  if (!message.inGuild() || message.author.bot) return;

  const args = message.content.trim().split(/\s+/);
  const mention = args[1]?.match(/^<@!?(\d+)>$/);
  const amountText = args[2];

  if (
    args.length !== 3 ||
    !mention ||
    !/^\d+$/.test(amountText ?? "")
  ) {
    await message.reply(
      "Usage: `!donate @user amount` — example: `!donate @Victor 100`"
    );
    return;
  }

  const target = message.mentions.users.get(mention[1]);
  const amount = Number(amountText);

  if (!target) {
    await message.reply("❌ Please mention a valid player.");
    return;
  }

  if (target.bot) {
    await message.reply("❌ You can't donate to bots.");
    return;
  }

  if (target.id === message.author.id) {
    await message.reply("❌ You can't donate to yourself.");
    return;
  }

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    await message.reply(
      "❌ Enter a positive whole number within the safe limit."
    );
    return;
  }

  // Verify membership before changing either balance.
  try {
    await message.guild.members.fetch(target.id);
  } catch (error) {
    console.error("Could not verify donation recipient:", error);

    await message.reply(
      "❌ Couldn't verify that player is in this server. Donation canceled."
    );
    return;
  }

  let result;

  try {
    result = await donateCoins(
      message.guildId,
      message.author.id,
      target.id,
      amount
    );
  } catch (error) {
    console.error("Donation transaction failed:", error);

    await message.reply(
      "❌ Couldn't confirm the donation. Check both balances before trying again."
    );
    return;
  }

  const { currencyName, currencyEmoji } = economyConfig;

  if (!result.success) {
    const errors = {
      insufficient_funds: `❌ You don't have enough ${currencyName}.`,
      balance_limit: "❌ That would exceed the recipient's balance limit.",
      self_donation: "❌ You can't donate to yourself.",
      invalid_amount: "❌ Enter a valid positive whole number.",
    };

    await message.reply(
      errors[result.reason] ?? "❌ Donation failed."
    );
    return;
  }

  await message.reply({
    content:
      `🎁 You donated **${amount.toLocaleString("en-US")} ${currencyName}** to <@${target.id}>!\n` +
      `${currencyEmoji ?? ""} Your balance is now **${result.senderBalance.toLocaleString("en-US")} ${currencyName}**.`,
    allowedMentions: { parse: [], repliedUser: false },
  });
}