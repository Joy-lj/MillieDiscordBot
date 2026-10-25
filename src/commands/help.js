import { EmbedBuilder } from "discord.js";

export async function helpCommand(message) {
  const helpEmbed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle("🤖 Bot Commands Help")
    .setDescription("Here is a list of all available commands:")
    .addFields(
      { name: "💰 Economy", value: "`!balance` - Check your current balance\n`!daily` - Claim your daily reward\n`!work` - Work to earn some cash", inline: false },
      { name: "📊 Rankings", value: "`!leaderboard` (or `!baltop`) - View the richest users", inline: false },
      { name: "🎲 Gambling", value: "`!dice`, `!blackjack`, `!bj` - Bet your money", inline: false },
      { name: "🎁 Donations", value: "`!donate @user <amount>` - Donate to the community pool", inline: false },    )
    .setTimestamp();

  await message.reply({ embeds: [helpEmbed] });
}