// import { EmbedBuilder } from "discord.js";
// import db from "../database/connection.js";

// export async function levelCommand(message) {
//   const targetUser = message.mentions.users.first() || message.author;

//   const account = await db.prepare(`
//     SELECT level, xp, balance FROM accounts
//     WHERE guild_id = ? AND user_id = ?
//   `).get(message.guild.id, targetUser.id);

//   const level = account?.level ?? 1;
//   const xp = account?.xp ?? 0;
//   const xpNeeded = level * 150; // Matches the progressive formula in addXp

//   const progressBars = 10;
//   const filledBars = Math.min(progressBars, Math.floor((xp / xpNeeded) * progressBars));
//   const emptyBars = progressBars - filledBars;
//   const progressBarString = "█".repeat(filledBars) + "░".repeat(emptyBars);

//   const embed = new EmbedBuilder()
//     .setColor(0x00ffcc)
//     .setTitle(`📊 Rank Stats: ${targetUser.username}`)
//     .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
//     .addFields(
//       { name: "⭐ Level", value: `${level}`, inline: true },
//       { name: "✨ XP Progress", value: `${xp} / ${xpNeeded} XP\n[${progressBarString}]`, inline: false },
//       { name: "💰 Balance", value: `${account?.balance ?? 0} cookies`, inline: true },
//       { name: "🎁 Next Milestone", value: `Level ${Math.ceil(level / 5) * 5} (Rewards Bonus Currency!)`, inline: false }
//     )
//     .setTimestamp();

//   return message.reply({ embeds: [embed] });
// }

import { EmbedBuilder } from "discord.js";
import db from "../database/connection.js";
import { economyConfig } from "../config/economy.js";

export async function levelCommand(message) {
  if (!message.inGuild() || message.author.bot) return;

  const targetUser =
    message.mentions.users.first() ?? message.author;

  const { rows } = await db.query(
    `SELECT level, xp, balance
     FROM public.accounts
     WHERE guild_id = $1 AND user_id = $2`,
    [message.guildId, targetUser.id]
  );

  const account = rows[0];

  // PostgreSQL BIGINT columns can be returned as strings.
  const level = Number(account?.level ?? 1);
  const xp = Number(account?.xp ?? 0);
  const balance = Number(account?.balance ?? 0);

  if (
    !Number.isSafeInteger(level) ||
    level < 1 ||
    !Number.isSafeInteger(xp) ||
    xp < 0 ||
    !Number.isSafeInteger(balance) ||
    balance < 0
  ) {
    throw new Error("Account stats are outside the supported range.");
  }

  const xpNeeded = level * 150;

  const progressBars = 10;
  const filledBars = Math.min(
    progressBars,
    Math.floor((xp / xpNeeded) * progressBars)
  );

  const progressBar =
    "█".repeat(filledBars) +
    "░".repeat(progressBars - filledBars);

  const nextMilestone = (Math.floor(level / 5) + 1) * 5;
  const milestoneReward = (nextMilestone / 5) * 250;

  const money = (amount) =>
    `${amount.toLocaleString("en-US")} ${economyConfig.currencyName}`;

  const embed = new EmbedBuilder()
    .setColor(0x00ffcc)
    .setTitle(`📊 Rank Stats: ${targetUser.username}`)
    .setThumbnail(targetUser.displayAvatarURL())
    .addFields(
      {
        name: "⭐ Level",
        value: level.toLocaleString("en-US"),
        inline: true,
      },
      {
        name: "✨ XP Progress",
        value:
          `${xp.toLocaleString("en-US")} / ` +
          `${xpNeeded.toLocaleString("en-US")} XP\n` +
          `[${progressBar}]`,
        inline: false,
      },
      {
        name: "💰 Balance",
        value: money(balance),
        inline: true,
      },
      {
        name: "🎁 Next Milestone",
        value:
          `Level **${nextMilestone}** — ` +
          `bonus **${money(milestoneReward)}**!`,
        inline: false,
      }
    )
    .setTimestamp();

  return message.reply({
    embeds: [embed],
    allowedMentions: { parse: [], repliedUser: false },
  });
}