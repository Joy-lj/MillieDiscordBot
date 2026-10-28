import { EmbedBuilder } from "discord.js";
import db from "../database/connection.js";

export async function levelCommand(message) {
  const targetUser = message.mentions.users.first() || message.author;

  const account = db.prepare(`
    SELECT level, xp, balance FROM accounts
    WHERE guild_id = ? AND user_id = ?
  `).get(message.guild.id, targetUser.id);

  const level = account?.level ?? 1;
  const xp = account?.xp ?? 0;
  const xpNeeded = level * 150; // Matches the progressive formula in addXp

  const progressBars = 10;
  const filledBars = Math.min(progressBars, Math.floor((xp / xpNeeded) * progressBars));
  const emptyBars = progressBars - filledBars;
  const progressBarString = "█".repeat(filledBars) + "░".repeat(emptyBars);

  const embed = new EmbedBuilder()
    .setColor(0x00ffcc)
    .setTitle(`📊 Rank Stats: ${targetUser.username}`)
    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: "⭐ Level", value: `${level}`, inline: true },
      { name: "✨ XP Progress", value: `${xp} / ${xpNeeded} XP\n[${progressBarString}]`, inline: false },
      { name: "💰 Balance", value: `${account?.balance ?? 0} cookies`, inline: true },
      { name: "🎁 Next Milestone", value: `Level ${Math.ceil(level / 5) * 5} (Rewards Bonus Currency!)`, inline: false }
    )
    .setTimestamp();

  return message.reply({ embeds: [embed] });
}