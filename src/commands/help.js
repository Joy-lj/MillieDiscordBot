import { EmbedBuilder } from "discord.js";

export async function helpCommand(message) {
  const helpEmbed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle("🤖 Bot Commands Help")
    .setDescription("Here is a list of all available commands:")
    .addFields(
      { name: "💰 Economy & Ranks", value: "`!balance` - Check your current balance\n`!level` (or `!rank`) - Check your level, XP, and milestone progress\n`!daily` - Claim your daily reward\n`!work` - Work to earn some cash\n`!fish` - Cast your line and catch fish\n`!fishbag` - View your fish inventory and sell caught fish",  inline: false },
      { name: "📊 Rankings", value: "`!leaderboard` (or `!baltop`) - View the richest users", inline: false },
      { name: "🎁 Donations", value: "`!donate @user <amount>` - Donate to the community pool", inline: false },
      { name: "🎲 Gambling & Minigames", value: "`!dice`, `!blackjack`, `!bj` - Bet your money against the house\n`!rps @user <amount>` - Challenge another player to a Rock, Paper, Scissors duel", inline: false },
      { name: "🛒 Item Shop & Gear", value: "`!shop` - Browse weapons and armor for sale\n`!buy <item_id> [qty]` - Buy items from the shop\n`!inventory` - View your owned gear, stats, and equipped items\n`!equip <instance_id>` - Equip an item instance by ID\n`!unequip <weapon|armor>` - Unequip your current gear\n`!sell <instance_id>` - Sell an item instance for cookies", inline: false },
      { name: "🎴 Card Collection", value: "`!cardshop` - Browse collectible cards\n`!buycard <card_id>` - Purchase a collectible card\n`!cardinventory` - View your card binder\n`!sellcard <card_id>` - Sell a card back from your collection", inline: false },
      { name: "⚔️ Combat", value: "`!duel @user <wager>` - Challenge a player to a duel with a cookie bet", inline: false },
      { name: "🐾 Pet System", value: "`!claimpet <dog|cat|bird>` - Adopt a companion pet\n`!pet` (or `!mypet`) - Check your pet status, stage, and XP\n`!petshop` - Visit the shop to purchase pet food\n`!buyfood` - Buy food packs for 50 cookies\n`!feedpet` - Feed your pet hourly to gain XP and evolve", inline: false }
    )
    .setTimestamp();

  await message.reply({ embeds: [helpEmbed] });
}