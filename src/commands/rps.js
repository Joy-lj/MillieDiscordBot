import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} from "discord.js";
import db from "../database/connection.js";
import { economyConfig } from "../config/economy.js";
import { createFlowerPokerStore } from "../../services/flowerPokerStore.js";

// Reuse the migrated two-player wager store: both stakes are held atomically.
// The rps: match namespace keeps its bet IDs distinct from flower poker games.
const { reserveMatch, settleMatch } = createFlowerPokerStore(db);
const pendingPlayers = new Set();
const quiet = { parse: [], repliedUser: false };
const money = (amount) => `${amount.toLocaleString("en-US")} ${economyConfig.currencyName}`;
const choiceLabels = { rock: "🪨 Rock", paper: "📄 Paper", scissors: "✂️ Scissors" };

function button(id, label, style = ButtonStyle.Secondary, emoji) {
  const result = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
  if (emoji) result.setEmoji(emoji);
  return result;
}

function winnerIndex(first, second) {
  if (first === second) return null;
  const beats = { rock: "scissors", paper: "rock", scissors: "paper" };
  return beats[first] === second ? 0 : 1;
}

function privateReply(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral })
    .catch((error) => console.error("RPS private reply failed:", error));
}

function collectChoices(prompt, players, prefix) {
  return new Promise((resolve) => {
    const choices = new Map();
    const collector = prompt.createMessageComponentCollector({
      time: 30_000,
      filter: (interaction) => {
        const choice = interaction.customId.slice(prefix.length);
        if (!interaction.isButton() || !interaction.customId.startsWith(prefix) ||
          !Object.hasOwn(choiceLabels, choice)) return false;
        if (!players.includes(interaction.user.id)) {
          void privateReply(interaction, "This duel belongs to other players. Start your own with !rps.");
          return false;
        }
        return true;
      },
    });
    collector.on("collect", (interaction) => {
      const user = interaction.user.id;
      if (choices.has(user)) {
        void privateReply(interaction, "You already locked in your choice.");
        return;
      }
      const choice = interaction.customId.slice(prefix.length);
      // Save before acknowledging so rapid clicks cannot replace a choice.
      choices.set(user, choice);
      void privateReply(interaction, `✅ You locked in **${choiceLabels[choice]}**!`);
      if (choices.size === 2) collector.stop("finished");
    });
    collector.on("end", (_, reason) => {
      resolve(reason === "finished" && choices.size === 2
        ? players.map((user) => choices.get(user))
        : null);
    });
  });
}

export async function rpsCommand(message) {
  if (!message.inGuild() || message.author.bot) return;
  const args = message.content.trim().split(/\s+/);
  const mention = args[1]?.match(/^<@!?(\d+)>$/);
  const targetUser = mention ? message.mentions.users.get(mention[1]) : null;
  if (args.length !== 3 || !targetUser || !/^\d+$/.test(args[2] ?? "")) {
    await message.reply({ content: "❌ Usage: `!rps @user <bet_amount>`", allowedMentions: quiet });
    return;
  }
  if (targetUser.bot) {
    await message.reply("❌ You cannot play against a bot!");
    return;
  }
  if (targetUser.id === message.author.id) {
    await message.reply("❌ You cannot play against yourself!");
    return;
  }
  const wager = Number(args[2]);
  if (!Number.isSafeInteger(wager) || wager < 1 || wager > 1_000_000) {
    await message.reply("❌ Bet a whole number between 1 and 1,000,000.");
    return;
  }
  const guildId = message.guildId;
  const players = [message.author.id, targetUser.id];
  const pendingKeys = players.map((user) => `${guildId}:${user}`);
  if (pendingKeys.some((key) => pendingPlayers.has(key))) {
    await message.reply("❌ A player already has an RPS invitation or duel in progress.");
    return;
  }
  pendingKeys.forEach((key) => pendingPlayers.add(key));

  let inviteMessage;
  let promptMessage;
  let match;
  let settled = false;

  try {
    // Informational check only; the wager store checks and locks again on acceptance.
    const { rows } = await db.query(
      `SELECT user_id, balance FROM public.accounts
       WHERE guild_id = $1 AND user_id = ANY($2::text[])`, [guildId, players]
    );
    const balances = new Map(rows.map((row) => [row.user_id, Number(row.balance)]));
    for (const player of players) {
      const balance = balances.get(player);
      if (!Number.isSafeInteger(balance) || balance < wager) {
        await message.reply({
          content: player === players[0]
            ? "❌ You do not have enough currency for this wager."
            : `❌ <@${player}> does not have enough currency to match this wager.`,
          allowedMentions: quiet,
        });
        return;
      }
    }

    const invitePrefix = `rps:${message.id}:invite:`;
    const inviteRow = new ActionRowBuilder().addComponents(
      button(`${invitePrefix}accept`, "Accept", ButtonStyle.Success),
      button(`${invitePrefix}decline`, "Decline", ButtonStyle.Danger)
    );
    inviteMessage = await message.channel.send({
      content: `<@${players[1]}>`,
      embeds: [new EmbedBuilder().setColor(0xffaa00)
        .setTitle("🎮 Rock, Paper, Scissors Challenge!")
        .setDescription(
          `<@${players[1]}>, <@${players[0]}> challenged you for **${money(wager)} each**!\n\n` +
          "You have **60 seconds** to accept or decline. Both wagers are held on acceptance. " +
          "Ties and choice timeouts refund both players."
        )],
      components: [inviteRow],
      allowedMentions: { parse: [], users: [players[1]], repliedUser: false },
    });

    let acceptance;
    try {
      acceptance = await inviteMessage.awaitMessageComponent({
        time: 60_000,
        filter: (interaction) => {
          if (!interaction.isButton() ||
            ![`${invitePrefix}accept`, `${invitePrefix}decline`].includes(interaction.customId)) return false;
          if (interaction.user.id !== players[1]) {
            void privateReply(interaction, "Only the challenged player can accept or decline.");
            return false;
          }
          return true;
        },
      });
    } catch (error) {
      if (error.code !== "InteractionCollectorError") throw error;
      await inviteMessage.edit({ content: "⏱️ RPS invitation expired. No wagers were taken.", embeds: [], components: [], allowedMentions: quiet });
      return;
    }

    // Acknowledge before waiting for the database.
    await acceptance.deferUpdate();
    if (acceptance.customId === `${invitePrefix}decline`) {
      await inviteMessage.edit({ content: "❌ The RPS challenge was declined. No wagers were taken.", embeds: [], components: [], allowedMentions: quiet });
      return;
    }

    match = await reserveMatch(guildId, players[0], players[1], wager, `rps:${inviteMessage.id}`);
    await inviteMessage.edit({
      content: `⚔️ Challenge accepted! **${money(wager)}** is held from each player. Choose below.`,
      embeds: [], components: [], allowedMentions: quiet,
    });

    const choicePrefix = `rps:${inviteMessage.id}:choice:`;
    const choiceRow = new ActionRowBuilder().addComponents(
      button(`${choicePrefix}rock`, "Rock", ButtonStyle.Secondary, "🪨"),
      button(`${choicePrefix}paper`, "Paper", ButtonStyle.Secondary, "📄"),
      button(`${choicePrefix}scissors`, "Scissors", ButtonStyle.Secondary, "✂️")
    );
    promptMessage = await message.channel.send({
      content: `🎮 <@${players[0]}> and <@${players[1]}>, choose below within **30 seconds**. ` +
        "Choices stay private until both players lock them in.",
      components: [choiceRow], allowedMentions: quiet,
    });
    const choices = await collectChoices(promptMessage, players, choicePrefix);

    if (!choices) {
      const refund = await settleMatch(match, null);
      settled = true;
      await promptMessage.edit({
        content: refund
          ? "⏱️ Someone did not choose in time. Both held wagers were refunded."
          : "This duel was already settled or refunded. Check !balance.",
        components: [], allowedMentions: quiet,
      });
      return;
    }

    const winner = winnerIndex(choices[0], choices[1]);
    const result = await settleMatch(match, winner);
    settled = true;
    if (!result) {
      await promptMessage.edit({ content: "This duel was already settled or refunded. Check !balance.", components: [], allowedMentions: quiet });
      return;
    }
    const resultText = winner === null
      ? "🤝 **It's a tie!** Both wagers were refunded."
      : `🎉 <@${players[winner]}> won **${money(wager * 2)} total**, including their stake ` +
      `(**+${money(wager)} profit**)!`;
    await promptMessage.edit({
      content: "🎮 **Rock, Paper, Scissors Results**\n\n" +
        `<@${players[0]}> chose: **${choiceLabels[choices[0]]}**\n` +
        `<@${players[1]}> chose: **${choiceLabels[choices[1]]}**\n\n${resultText}`,
      components: [], allowedMentions: quiet,
    });
  } catch (error) {
    console.error("RPS failed:", error);
    let notice;
    if (settled) {
      notice = "The duel settled, but the result message failed. Check !balance.";
    } else if (match) {
      try {
        const refund = await settleMatch(match, null);
        settled = true;
        notice = refund
          ? "The duel could not continue. Both held wagers were refunded."
          : "The duel was already settled or refunded. Check !balance.";
      } catch (refundError) {
        console.error("RPS refund could not be confirmed:", refundError);
        notice = "The duel could not continue and its refund could not be confirmed. Check !balance and the bot log.";
      }
    } else {
      notice = "The challenge could not start. Check both balances and active bets before trying again.";
    }
    const data = { content: notice, embeds: [], components: [], allowedMentions: quiet };
    if (promptMessage || inviteMessage) {
      await (promptMessage ?? inviteMessage).edit(data).catch(console.error);
    } else {
      await message.reply(data).catch(console.error);
    }
  } finally {
    pendingKeys.forEach((key) => pendingPlayers.delete(key));
  }
}
