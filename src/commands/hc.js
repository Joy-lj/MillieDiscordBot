import { EmbedBuilder } from "discord.js";
import { flowers } from "../config/flowerPoker.js";
import { economyConfig } from "../config/economy.js";
import { playHotCold } from "../database/hotCold.js";

const quiet = { parse: [], repliedUser: false };

const money = (amount) =>
  `${amount.toLocaleString("en-US")} ${economyConfig.currencyName}`;

function flowerIcon(guild, id) {
  const flower = flowers.find((item) => item.id === id);

  if (!flower) return "🌼";

  const emoji = guild.emojis.cache.find(
    (item) => item.name === flower.emojiName && item.available
  );

  return emoji?.toString() ?? flower.fallback;
}

export async function hotColdCommand(message) {
  if (!message.inGuild() || message.author.bot) return;

  const args = message.content.trim().split(/\s+/);
  const choice = args[1]?.toLowerCase();
  const amountText = args[2];

  if (
    args.length !== 3 ||
    !["hot", "cold"].includes(choice) ||
    !/^\d+$/.test(amountText ?? "")
  ) {
    await message.reply({
      content: "Usage: `!hc hot 100` or `!hc cold 100`",
      allowedMentions: quiet,
    });
    return;
  }

  const wager = Number(amountText);

  if (
    !Number.isSafeInteger(wager) ||
    wager < 1 ||
    wager > 1_000_000
  ) {
    await message.reply({
      content: "Bet a whole number between 1 and 1,000,000.",
      allowedMentions: quiet,
    });
    return;
  }

  try {
    await message.guild.emojis.fetch();
  } catch (error) {
    console.error(
      "HC emoji refresh failed; using cached emojis:",
      error
    );
  }

  let result;

  try {
    result = await playHotCold(
      message.guildId,
      message.author.id,
      wager,
      choice,
      message.id
    );
  } catch (error) {
    console.error("HC transaction failed:", error);

    await message.reply({
      content:
        "The game could not complete. Check your balance before trying again.",
      allowedMentions: quiet,
    });
    return;
  }

  if (result.error) {
    await message.reply({
      content: result.error,
      allowedMentions: quiet,
    });
    return;
  }

  // Accounting has committed. Display errors must never reroll the game.
  try {
    const flower = flowers.find(
      (item) => item.id === result.flower
    );

    const replantText =
      result.replants > 0
        ? `${flowerIcon(message.guild, "black")} Black replanted ` +
        `**${result.replants}** time(s), with no extra charge.\n\n`
        : "";

    const embed = new EmbedBuilder()
      .setTitle(`🌱 Hot / Cold — ${message.author.username}`)
      .setColor(
        result.multiplier === 3
          ? 0xf1c40f
          : result.multiplier === 2
            ? 0x2ecc71
            : 0xe74c3c
      )
      .setDescription(
        `Your bet: **${money(wager)} on ${choice.toUpperCase()}**\n\n` +
        replantText +
        `The bot planted: ${flowerIcon(message.guild, result.flower)} ` +
        `**${flower?.label ?? result.flower}**\n` +
        `**${result.reason}**\n\n` +
        `Returned: **${money(result.payout)}** ` +
        `(${result.multiplier}× wager)\n` +
        `Net: **${result.profit > 0 ? "+" : ""}` +
        `${money(result.profit)}**\n` +
        `${economyConfig.currencyEmoji ?? ""} Balance: ` +
        `**${money(result.balance)}**`
      )
      .setFooter({
        text:
          "Hot: red/yellow/orange • Cold: purple/assorted/blue • " +
          "Mixed loses • Black replants • White pays 3x",
      });

    await message.reply({
      embeds: [embed],
      allowedMentions: quiet,
    });
  } catch (error) {
    console.error(
      "HC settled but result display failed:",
      error
    );
  }
}