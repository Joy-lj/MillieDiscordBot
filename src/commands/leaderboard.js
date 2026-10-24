import { EmbedBuilder } from "discord.js";
import { getLeaderboard } from "../database/accounts.js";
import { economyConfig } from "../config/economy.js";


export async function leaderboardCommand(message) {
  if (!message.inGuild()) return;

  const accounts = getLeaderboard(message.guildId);

  if (accounts.length === 0) {
    await message.reply(
      "No accounts yet! Use `!daily` to start earning coins."
    );
    return;
  }

  const medals = ["🥇", "🥈", "🥉"];

  const rankings = accounts.map((account, index) => {
    const rank = medals[index] ?? `**${index + 1}.**`;
    const balance = account.balance.toLocaleString("en-US");

    return `${rank} <@${account.user_id}> — **${balance} ${economyConfig.currencyName}**`;
  });

  const embed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("🏆 Server Economy Leaderboard")
    .setDescription(rankings.join("\n"))
    .setFooter({ text: "Top 10 accounts • Ranked by balance" });

  await message.reply({
    embeds: [embed],
    allowedMentions: { parse: [], repliedUser: false },
  });
}