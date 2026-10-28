import { unequipItemBySerial } from "../database/items.js";

export async function unequipCommand(message) {
  const args = message.content.trim().split(/\s+/);
  const target = args[1]?.toLowerCase();
  const serialNumber = parseInt(args[2], 10);

  if (!target) {
    return message.reply("Please specify what you want to unequip!\nExamples: `!unequip weapon`, `!unequip armor`, or `!unequip foam-sword 1`");
  }

  const result = unequipItemBySerial(message.guild.id, message.author.id, target, serialNumber);

  if (!result.success) {
    if (result.reason === "nothing_equipped") {
      return message.reply("You don't have anything equipped in that slot!");
    }
    if (result.reason === "not_equipped") {
      return message.reply(`**${target} #${serialNumber}** is not currently equipped!`);
    }
    return message.reply("Failed to unequip gear.");
  }

  const itemName = result.item ? result.item.name : "gear";
  await message.reply(`🛡️ You successfully unequipped your **${itemName}**.`);
}