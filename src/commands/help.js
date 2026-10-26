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
      { name: "🎁 Donations", value: "`!donate @user <amount>` - Donate to the community pool", inline: false },
      { name: "🛒 Item Shop & Gear", value: "`!shop` - Browse weapons and armor for sale\n`!buy <item_id> [qty]` - Buy items from the shop\n`!inventory/!inv` - View your owned gear, stats, and equipped items\n`!equip <instance_id>` - Equip an item instance by ID\n`!unequip <weapon|armor>` - Unequip your current gear\n`!sell <instance_id>` - Sell an item instance for cookies", inline: false },
      { name: "🎴 Card Collection", value: "`!cardshop` - Browse collectible cards\n`!buycard <card_id>` - Purchase a collectible card\n`!cardinventory/!cardinv` - View your card binder\n`!sellcard <card_id>` - Sell a card back from your collection", inline: false },
      { name: "⚔️ Combat", value: "`!duel @user <wager>` - Challenge a player to a duel with a cookie bet", inline: false }
    )
    .setTimestamp();

  await message.reply({ embeds: [helpEmbed] });
}