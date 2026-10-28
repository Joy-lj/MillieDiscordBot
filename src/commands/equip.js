import { equipItemBySerial } from "../database/items.js";

export async function equipCommand(message) {
  const args = message.content.trim().split(/\s+/);
  const itemId = args[1]?.toLowerCase();
  const serialNumber = parseInt(args[2], 10);

  if (!itemId || isNaN(serialNumber)) {
    return message.reply("Please specify both the item name and its serial number!\nExample: `!equip foam-sword 1`");
  }

  const result = equipItemBySerial(message.guild.id, message.author.id, itemId, serialNumber);

  if (!result.success) {
    if (result.reason === "invalid_item") {
      return message.reply("That item doesn't exist! Check `!shop` for valid items.");
    }
    if (result.reason === "not_owned") {
      return message.reply(`You don't own **${itemId} #${serialNumber}**! Check your \`!inventory\` to verify your serial numbers.`);
    }
    return message.reply("Failed to equip item.");
  }

  const statLabel = result.item.type === "weapon" ? "Strength" : "Defense";
  await message.reply(`⚔️ You successfully equipped your **${result.item.name} #${result.serialNumber}**! (${statLabel}: +${result.item.stat})`);
}