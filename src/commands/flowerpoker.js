import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType,
  EmbedBuilder, MessageFlags,
} from "discord.js";
import { economyConfig } from "../config/economy.js";
import { flowerPokerConfig, flowers } from "../config/flowerPoker.js";
import { reserveMatch, settleMatch } from "../database/flowerPoker.js";
import { plantHand, rankHand, compareHands } from "../../services/flowerPokerLogic.js";

const pendingPlayers = new Set();
const money = (amount) => `${amount.toLocaleString("en-US")} ${economyConfig.currencyName}`;
const quiet = { parse: [], repliedUser: false };

function row(...buttons) {
  return new ActionRowBuilder().addComponents(buttons.map(([id, label, style]) =>
    new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style)));
}

async function waitForClick(prompt, eligible, time) {
  try {
    const click = await prompt.awaitMessageComponent({
      componentType: ComponentType.Button,
      time: Math.max(1, time),
      filter: (interaction) => {
        if (eligible(interaction)) return true;
        void interaction.reply({
          content: "This button is not available to you right now.",
          flags: MessageFlags.Ephemeral,
        }).catch(console.error);
        return false;
      },
    });
    await click.deferUpdate();
    return click;
  } catch (error) {
    if (error.code === "InteractionCollectorError") return null;
    throw error;
  }
}

function showHand(guild, hand) {
  const definitions = hand.map((id) => flowers.find((flower) => flower.id === id));
  const icons = definitions.map((flower) => {
    const emoji = guild.emojis.cache.find((item) => item.name === flower.emojiName && item.available);
    return emoji?.toString() ?? flower.fallback;
  }).join(" ");
  return `${icons}\n${definitions.map((flower) => flower.label).join(" • ")}\n**${rankHand(hand).name}**`;
}

export async function flowerPokerCommand(message) {
  if (!message.inGuild() || message.author.bot) return;
  await message.guild.emojis.fetch();
  const args = message.content.trim().split(/\s+/);
  const mention = args[1]?.match(/^<@!?(\d+)>$/);
  const amountText = args[2];
  if (args.length !== 3 || !mention || !/^\d+$/.test(amountText ?? "")) {
    await message.reply("Usage: `!fp @player 100` or `!flowerpoker @player 100`");
    return;
  }
  const opponent = message.mentions.users.get(mention[1]);
  const wager = Number(amountText);
  if (!opponent || opponent.bot || opponent.id === message.author.id) {
    await message.reply("Mention another human player to challenge.");
    return;
  }
  if (!Number.isSafeInteger(wager) || wager < 1 || wager > flowerPokerConfig.maxWager) {
    await message.reply(`Bet a whole number from 1 to ${flowerPokerConfig.maxWager.toLocaleString("en-US")}.`);
    return;
  }

  const keys = [message.author.id, opponent.id].map((id) => `${message.guildId}:${id}`);
  if (keys.some((key) => pendingPlayers.has(key))) {
    await message.reply("One of you already has a flower poker invitation or game. Finish it first.");
    return;
  }
  keys.forEach((key) => pendingPlayers.add(key));

  let prompt;
  let match;
  let settled = false;
  const acceptId = `fp_accept:${message.id}`;
  const declineId = `fp_decline:${message.id}`;
  const plantId = `fp_plant:${message.id}`;

  try {
    // Confirm that the challenged player is still in the server.
    await message.guild.members.fetch({ user: opponent.id, force: true });
    prompt = await message.reply({
      content: `<@${opponent.id}>, <@${message.author.id}> challenges you to flower poker!`,
      embeds: [new EmbedBuilder()
        .setTitle("🌱 Flower Poker Invitation")
        .setColor(0x6aa84f)
        .setDescription(
          `Each player stakes **${money(wager)}**.\n` +
          `Winner receives the **${money(wager * 2)}** pot. Ties refund both stakes.\n\n` +
          `Only the challenged player can accept. Either player can cancel.\n` +
          `Invitation expires in ${flowerPokerConfig.invitationMs / 1000} seconds.\n` +
          "Funds are checked and held only after acceptance."
        )],
      components: [row(
        [acceptId, "Accept", ButtonStyle.Success],
        [declineId, "Decline / Cancel", ButtonStyle.Secondary]
      )],
      allowedMentions: { users: [opponent.id], repliedUser: false },
    });

    const answer = await waitForClick(prompt, (click) =>
      (click.customId === acceptId && click.user.id === opponent.id) ||
      (click.customId === declineId && [message.author.id, opponent.id].includes(click.user.id)),
      flowerPokerConfig.invitationMs);

    if (!answer || answer.customId === declineId) {
      await prompt.edit({
        content: answer ? "Flower poker invitation canceled. No currency was deducted."
          : "Invitation expired. No currency was deducted.",
        embeds: [], components: [], allowedMentions: quiet,
      });
      return;
    }

    // Permission to participate is checked again at the point of acceptance.
    await Promise.all([message.author.id, opponent.id].map((id) =>
      message.guild.members.fetch({ user: id, force: true })));
    // BOTH deductions and BOTH wager records are one SQLite transaction.
    match = reserveMatch(message.guildId, message.author.id, opponent.id, wager, message.id);

    const planted = new Set();
    const deadline = Date.now() + flowerPokerConfig.plantingMs;
    const updatePlanting = () => prompt.edit({
      content:
        `🌱 **Flower Poker — ${money(wager * 2)} pot**\n\n` +
        [message.author, opponent].map((user) =>
          `<@${user.id}>: ${planted.has(user.id) ? "✅ Seeds planted" : "🌱 Waiting to plant"}`
        ).join("\n") +
        `\n\nBoth players: press **Plant 5 seeds** before <t:${Math.ceil(deadline / 1000)}:R>.\n` +
        "Hands stay hidden until both plant. Timeout refunds both wagers.",
      embeds: [], components: [row([plantId, "Plant 5 seeds", ButtonStyle.Success])],
      allowedMentions: quiet,
    });
    await updatePlanting();

    while (planted.size < 2) {
      const remaining = deadline - Date.now();
      const click = remaining > 0 ? await waitForClick(prompt, (interaction) =>
        interaction.customId === plantId &&
        match.players.includes(interaction.user.id) && !planted.has(interaction.user.id), remaining) : null;

      if (!click) {
        settleMatch(match, null);
        settled = true;
        await prompt.edit({
          content: "⏳ Planting timed out. Both wagers were refunded.",
          embeds: [], components: [], allowedMentions: quiet,
        });
        return;
      }
      planted.add(click.user.id);
      if (planted.size < 2) await updatePlanting();
    }

    // Generate both hands only after both players commit to planting.
    const firstHand = plantHand();
    const secondHand = plantHand();
    const comparison = compareHands(firstHand, secondHand);
    const winner = comparison === 0 ? null : comparison > 0 ? 0 : 1;
    const result = settleMatch(match, winner);
    if (!result) throw new Error("This match was already settled.");
    settled = true;

    const names = [message.author, opponent].map((user) => user.username);
    const resultText = winner === null
      ? `🤝 **Tie!** Each player gets their **${money(wager)}** back.`
      : `🏆 <@${match.players[winner]}> wins **${money(wager * 2)}**!\nNet profit: **${money(wager)}**.`;
    const embed = new EmbedBuilder()
      .setTitle("🌸 Flower Poker Results")
      .setColor(winner === null ? 0x95a5a6 : 0xf1c40f)
      .setDescription(resultText)
      .addFields(
        { name: names[0], value: showHand(message.guild, firstHand), inline: true },
        { name: names[1], value: showHand(message.guild, secondHand), inline: true },
        { name: "Balances", value: match.players.map((id, i) =>
          `<@${id}>: **${money(result.balances[i])}**`).join("\n") }
      )
      .setFooter({
  text: "Black or white = auto-loss • Both auto-lose = refund • Equal ranks tie",
});
    await prompt.edit({ content: "", embeds: [embed], components: [], allowedMentions: quiet });
  } catch (error) {
    console.error("Flower poker error:", error);
    let text;
    if (match && !settled) {
      try {
        const refund = settleMatch(match, null);
        settled = true;
        text = refund ? "The game was interrupted. Both wagers were refunded."
          : "The game was already settled. Check your balance.";
      } catch (refundError) {
        console.error("Flower poker refund failed:", refundError);
        text = "The game stopped and the refund could not complete. Ask an administrator to check the bot log.";
      }
    } else if (settled) {
      // A failed Discord edit must never undo or repeat a successful payout.
      text = "The game settled, but its result message could not update. Check your balance.";
    } else {
      text = `Could not start flower poker. No currency was deducted.\n${error.message}`;
    }
    const payload = { content: text, embeds: [], components: [], allowedMentions: quiet };
    if (prompt) await prompt.edit(payload).catch(console.error);
    else await message.reply({ content: text, allowedMentions: quiet }).catch(console.error);
  } finally {
    keys.forEach((key) => pendingPlayers.delete(key));
  }
}
