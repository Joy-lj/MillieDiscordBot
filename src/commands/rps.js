import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import db from "../database/connection.js";

export async function rpsCommand(message) {
  const args = message.content.trim().split(/\s+/);
  const targetUser = message.mentions.users.first();
  const betArg = args[2];

  if (!targetUser || !betArg || isNaN(betArg)) {
    return message.reply("❌ Usage: `!rps @user <bet_amount>`");
  }

  if (targetUser.bot) {
    return message.reply("❌ You cannot play against a bot! Use this command against another user.");
  }

  if (targetUser.id === message.author.id) {
    return message.reply("❌ You cannot play against yourself!");
  }

  const betAmount = parseInt(betArg, 10);
  if (betAmount <= 0) {
    return message.reply("❌ Your bet amount must be greater than 0.");
  }

  const guildId = message.guild.id;
  const p1Id = message.author.id;
  const p2Id = targetUser.id;

  // Check balances for both players
  const p1Account = db.prepare("SELECT balance FROM accounts WHERE guild_id = ? AND user_id = ?").get(guildId, p1Id);
  const p2Account = db.prepare("SELECT balance FROM accounts WHERE guild_id = ? AND user_id = ?").get(guildId, p2Id);

  if (!p1Account || p1Account.balance < betAmount) {
    return message.reply("❌ You do not have enough cookies to place that bet!");
  }
  if (!p2Account || p2Account.balance < betAmount) {
    return message.reply(`❌ <@${p2Id}> does not have enough cookies to match that bet!`);
  }

  // Send challenge invite with Accept / Decline buttons
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("rps_accept").setLabel("Accept").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("rps_decline").setLabel("Decline").setStyle(ButtonStyle.Danger)
  );

  const inviteEmbed = new EmbedBuilder()
    .setColor(0xffaa00)
    .setTitle("🎮 Rock, Paper, Scissors Challenge!")
    .setDescription(`<@${p2Id}>, you have been challenged to a Rock, Paper, Scissors duel by <@${p1Id}> for **${betAmount} cookies**!\n\nYou have **60 seconds** to accept or decline.`);

  const inviteMessage = await message.channel.send({
    content: `<@${p2Id}>`,
    embeds: [inviteEmbed],
    components: [row],
  });

  const filter = (i) => i.user.id === p2Id;
  const collector = inviteMessage.createMessageComponentCollector({ filter, time: 60000, max: 1 });

  collector.on("collect", async (interaction) => {
    if (interaction.customId === "rps_decline") {
      await interaction.update({
        content: `❌ <@${p2Id}> declined the Rock, Paper, Scissors challenge.`,
        embeds: [],
        components: [],
      });
      return;
    }

    if (interaction.customId === "rps_accept") {
      await interaction.update({
        content: `⚔️ Challenge accepted! Check your DMs (or play here) to make your choices! *(For privacy, players will choose in secret via DMs or buttons)*`,
        embeds: [],
        components: [],
      });

      // Simple implementation: Prompt both players via ephemeral/private collection or prompt choices
      // To keep it seamless in channel or DMs, let's trigger a secret choice phase.
      await runRpsMatch(message.channel, guildId, p1Id, p2Id, betAmount);
    }
  });

  collector.on("end", async (collected, reason) => {
    if (reason === "time") {
      await inviteMessage.edit({
        content: "⏱️ The Rock, Paper, Scissors challenge timed out.",
        embeds: [],
        components: [],
      }).catch(() => {});
    }
  });
}

async function runRpsMatch(channel, guildId, p1Id, p2Id, betAmount) {
  const choiceRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("rps_rock").setLabel("Rock").setEmoji("🪨").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("rps_paper").setLabel("Paper").setEmoji("📄").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("rps_scissors").setLabel("Scissors").setEmoji("✂️").setStyle(ButtonStyle.Secondary)
  );

  const promptMsg = await channel.send({
    content: `🎮 **Choose your weapon!** <@${p1Id}> and <@${p2Id}>, click your choice below. (You have 30 seconds)`,
    components: [choiceRow],
  });

  let p1Choice = null;
  let p2Choice = null;

  const filter = (i) => i.user.id === p1Id || i.user.id === p2Id;
  const collector = promptMsg.createMessageComponentCollector({ filter, time: 30000 });

  collector.on("collect", async (i) => {
    const choice = i.customId.replace("rps_", "");
    if (i.user.id === p1Id && !p1Choice) {
      p1Choice = choice;
      await i.reply({ content: `✅ You locked in **${choice}**!`, ephemeral: true });
    } else if (i.user.id === p2Id && !p2Choice) {
      p2Choice = choice;
      await i.reply({ content: `✅ You locked in **${choice}**!`, ephemeral: true });
    } else {
      await i.reply({ content: `⚠️ You already made your choice or aren't part of this duel!`, ephemeral: true });
      return;
    }

    if (p1Choice && p2Choice) {
      collector.stop("finished");
    }
  });

  collector.on("end", async (_, reason) => {
    if (reason !== "finished") {
      return promptMsg.edit({ content: "⏱️ The duel was cancelled because someone didn't choose in time.", components: [] }).catch(() => {});
    }

    // Double check balances before settling transaction
    const p1Acc = db.prepare("SELECT balance FROM accounts WHERE guild_id = ? AND user_id = ?").get(guildId, p1Id);
    const p2Acc = db.prepare("SELECT balance FROM accounts WHERE guild_id = ? AND user_id = ?").get(guildId, p2Id);

    if (p1Acc.balance < betAmount || p2Acc.balance < betAmount) {
      return channel.send("❌ Duel cancelled: One of the players no longer has enough balance.");
    }

    // Determine winner
    let winnerId = null;
    let loserId = null;
    let isTie = false;

    if (p1Choice === p2Choice) {
      isTie = true;
    } else if (
      (p1Choice === "rock" && p2Choice === "scissors") ||
      (p1Choice === "paper" && p2Choice === "rock") ||
      (p1Choice === "scissors" && p2Choice === "paper")
    ) {
      winnerId = p1Id;
      loserId = p2Id;
    } else {
      winnerId = p2Id;
      loserId = p1Id;
    }

    const tx = db.transaction(() => {
      if (!isTie) {
        db.prepare("UPDATE accounts SET balance = balance + ? WHERE guild_id = ? AND user_id = ?").run(betAmount, guildId, winnerId);
        db.prepare("UPDATE accounts SET balance = balance - ? WHERE guild_id = ? AND user_id = ?").run(betAmount, guildId, loserId);
      }
    });
    tx();

    const emojiMap = { rock: "🪨 Rock", paper: "📄 Paper", scissors: "✂️ Scissors" };

    let resultMsg = "";
    if (isTie) {
      resultMsg = `🤝 **It's a Tie!** No cookies changed hands.`;
    } else {
      resultMsg = `🎉 <@${winnerId}> won the duel and took **${betAmount} cookies** from <@${loserId}>!`;
    }

    await promptMsg.edit({
      content:
        `🎮 **Rock, Paper, Scissors Results**\n` +
        `----------------------------------\n` +
        `<@${p1Id}> chose: **${emojiMap[p1Choice]}**\n` +
        `<@${p2Id}> chose: **${emojiMap[p2Choice]}**\n` +
        `----------------------------------\n` +
        `${resultMsg}`,
      components: [],
    });
  });
}