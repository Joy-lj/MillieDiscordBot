import { EmbedBuilder } from "discord.js";
import { getUserInventory, getEquippedItems, ITEMS } from "../database/items.js";

export async function inventoryCommand(message) {
  const guildId = message.guild.id;
  const userId = message.author.id;
  
  const userItems = getUserInventory(guildId, userId);
  const equipped = getEquippedItems(guildId, userId);

  const embed = new EmbedBuilder()
    .setColor(0x00ffaa)
    .setTitle(`🎒 ${message.author.username}'s Inventory & Equipment`)
    .setTimestamp();

  // Show currently equipped items
  const weaponText = equipped.weapon ? `⚔️ **${equipped.weapon.name}** (+${equipped.weapon.stat} STR)` : "None";
  const armorText = equipped.armor ? `🛡️ **${equipped.armor.name}** (+${equipped.armor.stat} DEF)` : "None";
  
  embed.addFields(
    { name: "Current Loadout", value: `Weapon: ${weaponText}\nArmor: ${armorText}`, inline: false }
  );

  if (userItems.length === 0) {
    embed.addFields({ name: "Owned Items", value: "Your inventory is empty! Visit `!shop` to buy gear.", inline: false });
  } else {
    const itemList = userItems
      .map((row) => {
        const item = ITEMS[row.item_id];
        if (!item) return null;
        
        const isEquipped = equipped.weaponId === row.item_id || equipped.armorId === row.item_id;
        const equipTag = isEquipped ? " **[EQUIPPED]**" : "";
        const statLabel = item.type === "weapon" ? "STR" : "DEF";

        return `• **${item.name}** x${row.quantity}${equipTag}\n  *${item.description}*\n  Stat: +${item.stat} ${statLabel} | Use: ${item.use}`;
      })
      .filter(Boolean)
      .join("\n\n");

    embed.addFields({ name: "Owned Items", value: itemList, inline: false });
  }

  await message.reply({ embeds: [embed] });
}