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
import { resolveWager } from "../utils/resolveWager.js";

import {
  getUserCombatStats,
  getUserInventory,
  equipItemBySerial,
  unequipItemBySerial,
  ITEMS,
} from "../database/items.js";

const quiet = { parse: [], repliedUser: false };

const slots = new Set([
  "main_hand", "off_hand", "head", "torso", "legs",
  "hands", "feet", "cape", "neck", "ring", "ammo",
]);

function watch(collector, event, handler, onError) {
  collector.on(event, (...args) => {
    void Promise.resolve()
      .then(() => handler(...args))
      .catch(onError);
  });
}

export async function duelCommand(message) {
  if (!message.inGuild() || message.author.bot) return;

  const args = message.content.trim().split(/\s+/);
  const targetUser = message.mentions.users.first();

  if (args.length !== 3) {
    return message.reply("Usage: `!duel @user <amount|all>`");
  }

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

  const parsed = await resolveWager(message, args[2]);

  if (parsed.error) {
    return message.reply(parsed.error);
  }

  const betAmount = parsed.wager;
  const guildId = message.guild.id;
  const challengerId = message.author.id;
  const opponentId = targetUser.id;

  const challengerStats = await getUserCombatStats(
    guildId,
    challengerId
  );

  if (challengerStats.balance < betAmount) {
    return message.reply(
      `You don't have enough cookies! Balance: ` +
      `**${challengerStats.balance}** cookies.`
    );
  }

  const opponentStats = await getUserCombatStats(
    guildId,
    opponentId
  );

  if (opponentStats.balance < betAmount) {
    return message.reply(
      `${targetUser.username} doesn't have enough cookies ` +
      "to match that bet!"
    );
  }

  const inviteEmbed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle("⚔️ DUEL CHALLENGE!")
    .setDescription(
      `<@${opponentId}>, you have been challenged to a duel ` +
      `by <@${challengerId}>!\n\n` +
      `💰 **Wager:** ${betAmount} cookies each\n\n` +
      "*Click accept within 60 seconds to enter the lobby!*"
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

  const inviteCollector =
    duelMessage.createMessageComponentCollector({
      time: 60_000,
    });

  let invitationHandled = false;

  const failInvite = async (error) => {
    console.error("Duel invitation failed:", error);
    inviteCollector.stop("failed");

    await duelMessage.edit({
      content: "The duel could not start. No duel wager was charged.",
      embeds: [],
      components: [],
      allowedMentions: quiet,
    }).catch(console.error);
  };

  watch(inviteCollector, "collect", async (interaction) => {
    if (interaction.user.id !== opponentId) {
      return interaction.reply({
        content: "❌ This duel invitation is not for you!",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (
      !interaction.isButton() ||
      !["accept_duel", "decline_duel"].includes(
        interaction.customId
      )
    ) {
      return;
    }

    if (invitationHandled || inviteCollector.ended) {
      return interaction.deferUpdate();
    }

    invitationHandled = true;

    if (interaction.customId === "decline_duel") {
      await interaction.deferUpdate();
      inviteCollector.stop("declined");

      const declinedEmbed = new EmbedBuilder()
        .setColor(0x999999)
        .setTitle("⚔️ Duel Declined")
        .setDescription(
          `<@${opponentId}> declined the duel challenge ` +
          `from <@${challengerId}>.`
        );

      return duelMessage.edit({
        embeds: [declinedEmbed],
        components: [],
      });
    }

    await interaction.deferUpdate();
    inviteCollector.stop("accepted");

    await startLobbyPhase(
      duelMessage,
      guildId,
      message.author,
      targetUser,
      betAmount
    );
  }, failInvite);

  watch(inviteCollector, "end", async (_, reason) => {
    if (["accepted", "declined", "failed"].includes(reason)) {
      return;
    }

    const expiredEmbed = new EmbedBuilder()
      .setColor(0x999999)
      .setTitle("⚔️ Duel Challenge Expired")
      .setDescription(
        "The duel challenge timed out because the opponent " +
        "did not respond within 60 seconds."
      );

    await duelMessage.edit({
      embeds: [expiredEmbed],
      components: [],
    }).catch(console.error);
  }, console.error);
}

async function startLobbyPhase(
  duelMessage,
  guildId,
  challenger,
  opponent,
  betAmount
) {
  let challengerReady = false;
  let opponentReady = false;

  const buildLobbyEmbed = async () => {
    const cStats = await getUserCombatStats(
      guildId,
      challenger.id
    );

    const oStats = await getUserCombatStats(
      guildId,
      opponent.id
    );

    return new EmbedBuilder()
      .setColor(0xffaa00)
      .setTitle("🛡️ DUEL LOBBY — Prepare for Battle!")
      .setDescription(
        "Use your respective dropdown below to manage your gear.\n" +
        'Click **"READY"** when you are fully prepared!\n\n' +
        `💰 **Wager:** ${betAmount} cookies`
      )
      .addFields(
        {
          name:
            `${challenger.username} ` +
            (challengerReady ? "✅ [READY]" : "⏳ [PREPARING]"),
          value:
            `⚔️ Weapon: **${cStats.weaponName}** ` +
            `(+${cStats.attack} STR)\n` +
            `🛡️ Armor: **${cStats.armorName}** ` +
            `(+${cStats.defense} DEF)\n` +
            `💥 Total Power: **${cStats.totalPower}**`,
          inline: true,
        },
        {
          name:
            `${opponent.username} ` +
            (opponentReady ? "✅ [READY]" : "⏳ [PREPARING]"),
          value:
            `⚔️ Weapon: **${oStats.weaponName}** ` +
            `(+${oStats.attack} STR)\n` +
            `🛡️ Armor: **${oStats.armorName}** ` +
            `(+${oStats.defense} DEF)\n` +
            `💥 Total Power: **${oStats.totalPower}**`,
          inline: true,
        }
      )
      .setTimestamp();
  };

  const buildGearSelect = async (
    userId,
    customId,
    placeholder
  ) => {
    const userInv = await getUserInventory(guildId, userId);
    const cStats = await getUserCombatStats(guildId, userId);
    const options = [];

    if (cStats.equippedWeaponInstanceId) {
      options.push(
        new StringSelectMenuOptionBuilder()
          .setLabel(
            `Unequip Main Hand (${cStats.weaponName})`.slice(0, 100)
          )
          .setValue("unequip_weapon")
          .setDescription("Remove your currently equipped weapon")
      );
    }

    if (cStats.equippedArmorInstanceId) {
      options.push(
        new StringSelectMenuOptionBuilder()
          .setLabel(
            `Unequip Torso (${cStats.armorName})`.slice(0, 100)
          )
          .setValue("unequip_armor")
          .setDescription("Remove your currently equipped armor")
      );
    }

    for (const copy of userInv) {
      const item = ITEMS[copy.item_id];

      if (!item || !slots.has(item.slot)) continue;

      const isEquipped = (
        cStats.equippedInstanceIds ?? []
      ).some((id) => String(id) === String(copy.id));

      const upgrade = copy.upgrade_level
        ? ` +${copy.upgrade_level}`
        : "";

      options.push(
        new StringSelectMenuOptionBuilder()
          .setLabel(
            (
              `${item.name}${upgrade} #${copy.serial_number} ` +
              (isEquipped ? "[Equipped]" : "")
            ).slice(0, 100)
          )
          .setValue(`${copy.item_id}:${copy.serial_number}`)
          .setDescription(
            (
              `${item.type.toUpperCase()} • ` +
              item.slot.replace(/_/g, " ")
            ).slice(0, 100)
          )
      );
    }

    if (options.length === 0) {
      options.push(
        new StringSelectMenuOptionBuilder()
          .setLabel("No Gear Available")
          .setValue("none")
          .setDescription("You have no items in your inventory")
      );
    }

    return new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder.slice(0, 150))
      .addOptions(options.slice(0, 25));
  };

  const buildComponents = async () => {
    // Wait for finished menu builders before adding them to rows.
    const [challengerSelect, opponentSelect] = await Promise.all([
      buildGearSelect(
        challenger.id,
        `gear_select_${challenger.id}`,
        `${challenger.username}'s Gear Inventory`
      ),
      buildGearSelect(
        opponent.id,
        `gear_select_${opponent.id}`,
        `${opponent.username}'s Gear Inventory`
      ),
    ]);

    const readyRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ready_button")
        .setLabel("READY ✅")
        .setStyle(ButtonStyle.Success)
    );

    const challengerRow =
      new ActionRowBuilder().addComponents(challengerSelect);

    const opponentRow =
      new ActionRowBuilder().addComponents(opponentSelect);

    return [readyRow, challengerRow, opponentRow];
  };

  await duelMessage.edit({
    embeds: [await buildLobbyEmbed()],
    components: await buildComponents(),
  });

  const lobbyCollector =
    duelMessage.createMessageComponentCollector({
      time: 180_000,
    });

  let busy = false;
  let duelStarted = false;

  const failLobby = async (error) => {
    console.error("Duel lobby failed:", error);
    lobbyCollector.stop("failed");

    await duelMessage.edit({
      content:
        "The duel stopped because of an error. Check your " +
        "balance and the bot log before retrying.",
      embeds: [],
      components: [],
      allowedMentions: quiet,
    }).catch(console.error);
  };

  const refreshLobby = async () => {
    const embed = await buildLobbyEmbed();
    const components = await buildComponents();

    if (!lobbyCollector.ended) {
      await duelMessage.edit({
        embeds: [embed],
        components,
      });
    }
  };

  watch(lobbyCollector, "collect", async (interaction) => {
    if (
      ![challenger.id, opponent.id].includes(
        interaction.user.id
      )
    ) {
      return interaction.reply({
        content: "You are not a participant in this duel.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId !== `gear_select_${interaction.user.id}`
    ) {
      return interaction.reply({
        content: "You can only manage your own gear.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (
      !interaction.isStringSelectMenu() &&
      (
        !interaction.isButton() ||
        interaction.customId !== "ready_button"
      )
    ) {
      return;
    }

    if (duelStarted || lobbyCollector.ended) {
      return interaction.deferUpdate();
    }

    if (busy) {
      return interaction.reply({
        content: "Please wait for the previous action to finish.",
        flags: MessageFlags.Ephemeral,
      });
    }

    busy = true;

    try {
      await interaction.deferUpdate();

      if (lobbyCollector.ended) return;

      if (interaction.isStringSelectMenu()) {
        // Both players must approve the changed matchup.
        challengerReady = false;
        opponentReady = false;

        const selected = interaction.values[0];
        let result;

        if (selected === "unequip_weapon") {
          result = await unequipItemBySerial(
            guildId,
            interaction.user.id,
            "main_hand"
          );
        } else if (selected === "unequip_armor") {
          result = await unequipItemBySerial(
            guildId,
            interaction.user.id,
            "torso"
          );
        } else if (selected !== "none") {
          const [itemId, serialText] = selected.split(":");
          const serial = Number(serialText);

          if (
            !/^\d+$/.test(serialText ?? "") ||
            !Number.isSafeInteger(serial) ||
            serial < 1
          ) {
            throw new Error("Invalid gear selection.");
          }

          result = await equipItemBySerial(
            guildId,
            interaction.user.id,
            itemId,
            serial
          );
        }

        if (result && !result.success) {
          const errors = {
            two_handed_equipped:
              "Unequip your two-handed main weapon before " +
              "equipping an off-hand item.",
            not_owned:
              "You no longer own that copy. Refresh your inventory.",
            nothing_equipped: "That slot is already empty.",
            invalid_item: "That item is unavailable.",
            invalid_type: "That item cannot be equipped.",
          };

          await interaction.followUp({
            content:
              errors[result.reason] ??
              "The equipment change could not complete.",
            flags: MessageFlags.Ephemeral,
          }).catch(console.error);
        }

        await refreshLobby();
        return;
      }

      if (interaction.user.id === challenger.id) {
        challengerReady = !challengerReady;
      } else {
        opponentReady = !opponentReady;
      }

      if (challengerReady && opponentReady) {
        duelStarted = true;
        lobbyCollector.stop("duel_started");

        await resolveDuel(
          guildId,
          challenger,
          opponent,
          betAmount,
          duelMessage
        );

        return;
      }

      await refreshLobby();
    } finally {
      busy = false;
    }
  }, failLobby);

  watch(lobbyCollector, "end", async (_, reason) => {
    if (reason === "duel_started" || reason === "failed") {
      return;
    }

    const expiredEmbed = new EmbedBuilder()
      .setColor(0x999999)
      .setTitle("Duel Cancelled")
      .setDescription(
        "The lobby timed out before both players readied up. " +
        "No duel wager was charged."
      );

    await duelMessage.edit({
      embeds: [expiredEmbed],
      components: [],
    }).catch(console.error);
  }, console.error);
}

async function resolveDuel(
  guildId,
  challenger,
  opponent,
  betAmount,
  duelMessage
) {
  const [finalChallenger, finalOpponent] = await Promise.all([
    getUserCombatStats(guildId, challenger.id),
    getUserCombatStats(guildId, opponent.id),
  ]);

  if (
    finalChallenger.balance < betAmount ||
    finalOpponent.balance < betAmount
  ) {
    const cancelEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("❌ Duel Cancelled")
      .setDescription(
        "One of the players no longer has enough cookies " +
        "to fulfill the bet!"
      );

    return duelMessage.edit({
      embeds: [cancelEmbed],
      components: [],
    });
  }

  const challengerRoll =
    finalChallenger.totalPower + Math.random();

  const opponentRoll =
    finalOpponent.totalPower + Math.random();

  const challengerWon = challengerRoll > opponentRoll;

  const winnerId = challengerWon
    ? challenger.id
    : opponent.id;

  const loserId = challengerWon
    ? opponent.id
    : challenger.id;

  const winnerName = challengerWon
    ? challenger.username
    : opponent.username;

  const loserName = challengerWon
    ? opponent.username
    : challenger.username;

  const transferred = await settleDuelWager(
    guildId,
    challenger.id,
    opponent.id,
    winnerId,
    loserId,
    betAmount,
    duelMessage.id
  );

  if (!transferred.success) {
    return duelMessage.edit({
      content: transferred.message,
      embeds: [],
      components: [],
      allowedMentions: quiet,
    });
  }

  const resultEmbed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle("⚔️ DUEL FINISHED!")
    .addFields(
      {
        name: `${challenger.username}'s Final Loadout`,
        value:
          `Weapon: **${finalChallenger.weaponName}**\n` +
          `Armor: **${finalChallenger.armorName}**\n` +
          `Total Power: **${finalChallenger.totalPower}**`,
        inline: true,
      },
      {
        name: `${opponent.username}'s Final Loadout`,
        value:
          `Weapon: **${finalOpponent.weaponName}**\n` +
          `Armor: **${finalOpponent.armorName}**\n` +
          `Total Power: **${finalOpponent.totalPower}**`,
        inline: true,
      },
      {
        name: "🏆 Winner",
        value:
          `**${winnerName}** defeated ${loserName} in combat ` +
          `and claimed **${betAmount}** cookies!`,
        inline: false,
      }
    )
    .setTimestamp();

  // Settlement is committed. A failed message must not repeat payment.
  await duelMessage.edit({
    content: null,
    embeds: [resultEmbed],
    components: [],
    allowedMentions: quiet,
  }).catch((error) => {
    console.error("Duel settled; result message failed:", error);
  });
}

// Uses the existing PostgreSQL accounts and bets tables.
// Settled bet rows prevent the same duel from transferring twice.
async function settleDuelWager(
  guild,
  first,
  second,
  winner,
  loser,
  amount,
  matchId
) {
  if (!Number.isSafeInteger(amount) || amount < 1) {
    throw new Error("Invalid duel wager.");
  }

  const ids = [
    `duel:${matchId}:a`,
    `duel:${matchId}:b`,
  ];

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    // Always lock both accounts in the same order.
    const { rows } = await client.query(
      `SELECT user_id, balance
       FROM public.accounts
       WHERE guild_id = $1
         AND user_id = ANY($2::text[])
       ORDER BY user_id
       FOR UPDATE`,
      [guild, [first, second].sort()]
    );

    const prior = await client.query(
      `SELECT id
       FROM public.bets
       WHERE id = ANY($1::text[])`,
      [ids]
    );

    if (prior.rows.length) {
      if (prior.rows.length !== 2) {
        throw new Error("Inconsistent duel settlement markers.");
      }

      await client.query("ROLLBACK");

      return {
        success: false,
        message: "This duel was already settled. Check !balance.",
      };
    }

    const balances = new Map(
      rows.map((row) => [
        row.user_id,
        Number(row.balance),
      ])
    );

    if (
      [first, second].some((id) =>
        !Number.isSafeInteger(balances.get(id)) ||
        balances.get(id) < amount
      )
    ) {
      await client.query("ROLLBACK");

      return {
        success: false,
        message:
          "Duel cancelled: both players must still have enough " +
          "currency. No duel wager was charged.",
      };
    }

    if (
      balances.get(winner) >
      Number.MAX_SAFE_INTEGER - amount
    ) {
      await client.query("ROLLBACK");

      return {
        success: false,
        message:
          "Duel cancelled: the payout would exceed the winner's " +
          "balance limit. No duel wager was charged.",
      };
    }

    const debited = await client.query(
      `UPDATE public.accounts
       SET balance = balance - $1
       WHERE guild_id = $2
         AND user_id = $3
         AND balance >= $1
       RETURNING balance`,
      [amount, guild, loser]
    );

    const credited = await client.query(
      `UPDATE public.accounts
       SET balance = balance + $1
       WHERE guild_id = $2
         AND user_id = $3
         AND balance <= $4
       RETURNING balance`,
      [
        amount,
        guild,
        winner,
        Number.MAX_SAFE_INTEGER - amount,
      ]
    );

    if (
      debited.rows.length !== 1 ||
      credited.rows.length !== 1
    ) {
      throw new Error("Duel transfer failed.");
    }

    await client.query(
      `INSERT INTO public.bets
         (id, guild_id, user_id, wager, status)
       VALUES
         ($1, $2, $3, $5, 'settled'),
         ($4, $2, $6, $5, 'settled')`,
      [
        ids[0],
        guild,
        first,
        ids[1],
        amount,
        second,
      ]
    );

    await client.query("COMMIT");

    return { success: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(console.error);
    throw error;
  } finally {
    client.release();
  }
}