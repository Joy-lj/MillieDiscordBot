import { equipItemInstance, ITEMS } from "../database/items.js";

export async function equipCommand(message) {
  const args = message.content.trim().split(/\s+/);
  const instanceId = parseInt(args[1], 10);

  if (isNaN(instanceId)) {
    return message.reply("Please specify the item instance ID to equip! Check `!inventory` for IDs. Example: `!equip 1`");
  }

  const result = equipItemInstance(message.guild.id, message.author.id, instanceId);

  if (!result.success) {
    return message.reply("You do not own that item instance!");
  }

  const statLabel = result.item.type === "weapon" ? "Strength" : "Defense";
  await message.reply(`⚔️ You successfully equipped your **${result.item.name} #${result.serialNumber}**! (${statLabel}: +${result.item.stat})`);
}