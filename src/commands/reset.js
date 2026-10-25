import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  PermissionFlagsBits,
} from "discord.js";

import { resetEconomy } from "../database/resetEconomy.js";

export async function resetCommand(message) {
  if (!message.inGuild()) return;

  if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
    await message.reply("❌ Only administrators can use this command.");
    return;
  }

  const confirmId = `reset_confirm_${message.id}`;
  const cancelId = `reset_cancel_${message.id}`;

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(confirmId)
      .setLabel("Yes, reset the economy")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId(cancelId)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary)
  );

  const prompt = await message.reply({
    content:
      "⚠️ **Are you sure you want to reset this server's economy?**\n\n" +
      "This deletes every account balance, daily/work cooldown, " +
      "and saved bet in this server.\n" +
      "**This cannot be undone.**\n\n" +
      "Only you can confirm. This request expires in 30 seconds.",
    components: [buttons],
    allowedMentions: { parse: [], repliedUser: false },
  });

  let confirmation;

  try {
    confirmation = await prompt.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (interaction) =>
        interaction.user.id === message.author.id &&
        [confirmId, cancelId].includes(interaction.customId),
      time: 30_000,
    });
  } catch (error) {
    if (error.code !== "InteractionCollectorError") throw error;

    await prompt.edit({
      content: "⏳ Confirmation expired. The economy was not wiped.",
      components: [],
    });

    return;
  }
  // Acknowledge the button before doing any further work.
  await confirmation.deferUpdate();

  if (confirmation.customId === cancelId) {
    await prompt.edit({
      content: "✅ Wipe canceled. The economy was not changed.",
      components: [],
    });

    return;
  }

  // Fetch current permissions in case they changed during confirmation.
  let member;

  try {
    member = await message.guild.members.fetch({
      user: message.author.id,
      force: true,
    });
  } catch (error) {
    console.error("Could not verify wipe permissions:", error);

    await prompt.edit({
      content: "❌ Could not verify your permissions. Wipe canceled.",
      components: [],
    });

    return;
  }

  if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
    await prompt.edit({
      content: "❌ You no longer have Administrator permission. Wipe canceled.",
      components: [],
    });

    return;
  }

  let result;

  try {
    result = resetEconomy(message.guildId);
  } catch (error) {
    console.error("Economy wipe failed:", error);

    await prompt.edit({
      content: "❌ The database reset failed. Check the bot's terminal.",
      components: [],
    });

    return;
  }

  if (!result.success) {
    await prompt.edit({
      content:
        "❌ A bet is still active. Let it finish, then run `!wipe` again.",
      components: [],
    });

    return;
  }

  await prompt.edit({
    content:
      "🧹 **This server's economy has been wiped.**\n" +
      `Accounts deleted: **${result.accountsDeleted}**\n` +
      "Balances, daily/work cooldowns, and bet history have been reset.",
    components: [],
  });
}