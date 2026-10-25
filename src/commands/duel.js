import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
} from "discord.js";
import db from "../database/connection.js";
import {
  getUserCombatStats,
  getUserInventory,
  equipItem,
  unequipItem,
  ITEMS,
} from "../database/items.js";

export async function duelCommand(message) {
  const args = message.content.trim().split(/\s+/);
  const targetUser = message.mentions.users.first();
  const betAmount = parseInt(args[2], 10);

  // --- 1. Validation Checks ---
  if (!targetUser) {
    return message.reply(
      "Please mention a user to duel! Example: `!duel @username 100`"
    );
  }
  if (targetUser.bot) {
    return message.reply("You cannot duel a bot!");
  }
  if (targetUser.id === message.author.id) {
    return message.reply("You cannot duel yourself!");
  }
  if (isNaN(betAmount) || betAmount <= 0) {
    return message.reply(
      "Please specify a valid positive number of cookies to bet! Example: `!duel @username 100`"
    );
  }

  const guildId = message.guild.id;
  const challengerId = message.author.id;
  const opponentId = targetUser.id;

  const challengerStats = getUserCombatStats(guildId, challengerId);
  if (challengerStats.balance < betAmount) {
    return message.reply(
      `You don't have enough cookies! Balance: **${challengerStats.balance}** cookies.`
    );
  }

  const opponentStats = getUserCombatStats(guildId, opponentId);
  if (opponentStats.balance < betAmount) {
    return message.reply(
      `${targetUser.username} doesn't have enough cookies to match that bet!`
    );
  }

  // --- 2. Initial Challenge Step (60s Invite Timer) ---
  const inviteEmbed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle("⚔️ DUEL CHALLENGE!")
    .setDescription(
      `<@${opponentId}>, you have been challenged to a duel by <@${challengerId}>!\n\n💰 **Wager:** ${betAmount} cookies each\n\n*Click accept within 60 seconds to enter the lobby!*`
    )
    .setTimestamp();

  const inviteRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("accept_duel")
      .setLabel("Accept ⚔️")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("decline_duel")
      .setLabel("Decline ❌")
      .setStyle(ButtonStyle.Danger)
  );

  const duelMessage = await message.reply({
    content: `<@${opponentId}>`,
    embeds: [inviteEmbed],
    components: [inviteRow],
  });

  const inviteCollector = duelMessage.createMessageComponentCollector({
    time: 60000,
  });

  inviteCollector.on("collect", async (interaction) => {
    if (interaction.user.id !== opponentId) {
      return interaction.reply({
        content: "❌ This duel invitation is not for you!",
        flags: [MessageFlags.Ephemeral],
      });
    }

    if (interaction.customId === "decline_duel") {
      await interaction.deferUpdate();
      inviteCollector.stop("declined");

      const declinedEmbed = new EmbedBuilder()
        .setColor(0x999999)
        .setTitle("⚔️ Duel Declined")
        .setDescription(
          `<@${opponentId}> declined the duel challenge from <@${challengerId}>.`
        );
      return duelMessage.edit({ embeds: [declinedEmbed], components: [] });
    }

    if (interaction.customId === "accept_duel") {
      await interaction.deferUpdate();
      inviteCollector.stop("accepted");

      await startLobbyPhase(
        duelMessage,
        guildId,
        message.author,
        targetUser,
        betAmount
      );
    }
  });

  inviteCollector.on("end", async (collected, reason) => {
    if (reason !== "accepted" && reason !== "declined") {
      const expiredEmbed = new EmbedBuilder()
        .setColor(0x999999)
        .setTitle("⚔️ Duel Challenge Expired")
        .setDescription(
          "The duel challenge timed out because the opponent did not respond within 60 seconds."
        );
      await duelMessage
        .edit({ embeds: [expiredEmbed], components: [] })
        .catch(() => {});
    }
  });
}

// --- 3. Lobby Phase Function (Direct-Update Flow) ---
async function startLobbyPhase(
  duelMessage,
  guildId,
  challenger,
  opponent,
  betAmount
) {
  let challengerReady = false;
  let opponentReady = false;

  const buildLobbyEmbed = () => {
    const cStats = getUserCombatStats(guildId, challenger.id);
    const oStats = getUserCombatStats(guildId, opponent.id);

    return new EmbedBuilder()
      .setColor(0xffaa00)
      .setTitle("🛡️ DUEL LOBBY — Prepare for Battle!")
      .setDescription(
        `Use your respective dropdown below to manage your gear.\nClick **"READY"** when you are fully prepared!\n\n💰 **Wager:** ${betAmount} cookies`
      )
      .addFields(
        {
          name: `${challenger.username} ${
            challengerReady ? "✅ [READY]" : "⏳ [PREPARING]"
          }`,
          value: `⚔️ Weapon: **${cStats.weaponName}** (+${cStats.attack} STR)\n🛡️ Armor: **${cStats.armorName}** (+${cStats.defense} DEF)\n💥 Total Power: **${cStats.totalPower}**`,
          inline: true,
        },
        {
          name: `${opponent.username} ${
            opponentReady ? "✅ [READY]" : "⏳ [PREPARING]"
          }`,
          value: `⚔️ Weapon: **${oStats.weaponName}** (+${oStats.attack} STR)\n🛡️ Armor: **${oStats.armorName}** (+${oStats.defense} DEF)\n💥 Total Power: **${oStats.totalPower}**`,
          inline: true,
        }
      )
      .setTimestamp();
  };

  const buildGearSelect = (userId, customId, placeholder) => {
    const userInv = getUserInventory(guildId, userId);
    const cStats = getUserCombatStats(guildId, userId);

    const options = [
      new StringSelectMenuOptionBuilder()
        .setLabel("Unequip Weapon")
        .setValue("unequip_weapon")
        .setDescription("Remove your currently equipped weapon"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Unequip Armor")
        .setValue("unequip_armor")
        .setDescription("Remove your currently equipped armor"),
    ];

    for (const row of userInv) {
      const item = ITEMS[row.item_id];
      if (!item) continue;

      const isEquipped =
        cStats.weaponName === item.name || cStats.armorName === item.name;
      const statType = item.type === "weapon" ? "STR" : "DEF";

      options.push(
        new StringSelectMenuOptionBuilder()
          .setLabel(
            `${item.name} (+${item.stat} ${statType}) ${
              isEquipped ? "[Equipped]" : ""
            }`
          )
          .setValue(row.item_id)
          .setDescription(
            `Type: ${item.type.toUpperCase()} | Qty: ${row.quantity}`
          )
      );
    }

    return new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .addOptions(options.slice(0, 25));
  };

  const buildComponents = () => {
    const readyRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ready_button")
        .setLabel("READY ✅")
        .setStyle(ButtonStyle.Success)
    );

    const challengerSelectRow = new ActionRowBuilder().addComponents(
      buildGearSelect(
        challenger.id,
        `gear_select_${challenger.id}`,
        `${challenger.username}'s Gear Inventory`
      )
    );

    const opponentSelectRow = new ActionRowBuilder().addComponents(
      buildGearSelect(
        opponent.id,
        `gear_select_${opponent.id}`,
        `${opponent.username}'s Gear Inventory`
      )
    );

    return [readyRow, challengerSelectRow, opponentSelectRow];
  };

  await duelMessage.edit({
    embeds: [buildLobbyEmbed()],
    components: buildComponents(),
  });

  const lobbyCollector = duelMessage.createMessageComponentCollector({
    time: 180000,
  });

  lobbyCollector.on("collect", async (i) => {
    // 1. Block outsiders completely
    if (i.user.id !== challenger.id && i.user.id !== opponent.id) {
      return i.reply({
        content: "❌ You are not a participant in this duel!",
        flags: [MessageFlags.Ephemeral],
      });
    }

    // 2. Handle Gear Dropdowns with strict ownership checks
    if (i.isStringSelectMenu()) {
      const expectedCustomId = `gear_select_${i.user.id}`;
      
      if (i.customId !== expectedCustomId) {
        return i.reply({
          content: "❌ You can only manage your own gear inventory!",
          flags: [MessageFlags.Ephemeral],
        });
      }

      await i.deferUpdate();

      if (i.user.id === challenger.id) challengerReady = false;
      else opponentReady = false;

      const selectedValue = i.values[0];

      if (selectedValue === "unequip_weapon") {
        unequipItem(guildId, i.user.id, "weapon");
      } else if (selectedValue === "unequip_armor") {
        unequipItem(guildId, i.user.id, "armor");
      } else {
        equipItem(guildId, i.user.id, selectedValue);
      }

      return duelMessage.edit({
        embeds: [buildLobbyEmbed()],
        components: buildComponents(),
      });
    }

    // 3. Ready Button Handling
    if (i.customId === "ready_button") {
      await i.deferUpdate();

      if (i.user.id === challenger.id) challengerReady = !challengerReady;
      if (i.user.id === opponent.id) opponentReady = !opponentReady;

      if (challengerReady && opponentReady) {
        lobbyCollector.stop("duel_started");
        return resolveDuel(guildId, challenger, opponent, betAmount, duelMessage);
      }

      return duelMessage.edit({
        embeds: [buildLobbyEmbed()],
        components: buildComponents(),
      });
    }
  });

  lobbyCollector.on("end", async (collected, reason) => {
    if (reason !== "duel_started") {
      const expiredEmbed = new EmbedBuilder()
        .setColor(0x999999)
        .setTitle("⚔️ Duel Cancelled")
        .setDescription("The lobby timed out before both players readied up.");
      await duelMessage
        .edit({ embeds: [expiredEmbed], components: [] })
        .catch(() => {});
    }
  });
}

// --- 4. Resolve Combat Settlement ---
async function resolveDuel(guildId, challenger, opponent, betAmount, duelMessage) {
  const finalChallenger = getUserCombatStats(guildId, challenger.id);
  const finalOpponent = getUserCombatStats(guildId, opponent.id);

  if (finalChallenger.balance < betAmount || finalOpponent.balance < betAmount) {
    const cancelEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("❌ Duel Cancelled")
      .setDescription(
        "One of the players no longer has enough cookies to fulfill the bet!"
      );
    return duelMessage.edit({ embeds: [cancelEmbed], components: [] });
  }

  const challengerRoll = finalChallenger.totalPower + Math.random();
  const opponentRoll = finalOpponent.totalPower + Math.random();
  const challengerWon = challengerRoll > opponentRoll;

  const winnerId = challengerWon ? challenger.id : opponent.id;
  const loserId = challengerWon ? opponent.id : challenger.id;
  const winnerName = challengerWon ? challenger.username : opponent.username;
  const loserName = challengerWon ? opponent.username : challenger.username;

  db.transaction(() => {
    db.prepare(
      `UPDATE accounts SET balance = balance - ? WHERE guild_id = ? AND user_id = ?`
    ).run(betAmount, guildId, loserId);
    db.prepare(
      `UPDATE accounts SET balance = balance + ? WHERE guild_id = ? AND user_id = ?`
    ).run(betAmount, guildId, winnerId);
  }).immediate();

  const resultEmbed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle("⚔️ DUEL FINISHED!")
    .addFields(
      {
        name: `${challenger.username}'s Final Loadout`,
        value: `Weapon: **${finalChallenger.weaponName}**\nArmor: **${finalChallenger.armorName}**\nTotal Power: **${finalChallenger.totalPower}**`,
        inline: true,
      },
      {
        name: `${opponent.username}'s Final Loadout`,
        value: `Weapon: **${finalOpponent.weaponName}**\nArmor: **${finalOpponent.armorName}**\nTotal Power: **${finalOpponent.totalPower}**`,
        inline: true,
      },
      {
        name: "🏆 Winner",
        value: `**${winnerName}** defeated ${loserName} in combat and claimed **${betAmount}** cookies!`,
        inline: false,
      }
    )
    .setTimestamp();

  await duelMessage.edit({ embeds: [resultEmbed], components: [] });
}