import { EmbedBuilder } from "discord.js";
import { getUserInventory, getUserCombatStats, ITEMS } from "../database/items.js";

export async function inventoryCommand(message) {
  const guildId = message.guild.id;
  const userId = message.author.id;

  const stats = getUserCombatStats(guildId, userId);
  const inventory = getUserInventory(guildId, userId);

  const embed = new EmbedBuilder()
    .setColor(0x00ae86)
    .setTitle(`🎒 ${message.author.username}'s Inventory & Loadout`)
    .setDescription(`💰 **Balance:** ${stats.balance} cookies`)
    .addFields(
      {
        name: "🛡️ Equipped Gear",
        value: `⚔️ Weapon: **${stats.weaponName}** (+${stats.attack} STR)\n🛡️ Armor: **${stats.armorName}** (+${stats.defense} DEF)\n💥 **Total Combat Power:** ${stats.totalPower}`,
        inline: false,
      }
    )
    .setTimestamp();

  if (inventory.length === 0) {
    embed.addFields({
      name: "📦 Items Owned",
      value: "*Your inventory is empty! Visit the shop to buy gear.*",
      inline: false,
    });
  } else {
    const itemList = inventory
      .map((row) => {
        const item = ITEMS[row.item_id];
        if (!item) return null;
        const statLabel = item.type === "weapon" ? "STR" : "DEF";
        const isEquipped = stats.equippedWeaponInstanceId === row.id || stats.equippedArmorInstanceId === row.id;
        return `• **${item.name} #${row.serial_number}** (+${item.stat} ${statLabel}) ${isEquipped ? "✅ [Equipped]" : ""} — ID: \`${row.id}\``;
      })
      .filter(Boolean)
      .join("\n");

    embed.addFields({
      name: "📦 Items Owned (Numbered Instances)",
      value: itemList || "*No items found.*",
      inline: false,
    });
  }

  return message.reply({ embeds: [embed] });
}