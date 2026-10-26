import { unequipItem } from "../database/items.js";

export async function unequipCommand(message) {
  const args = message.content.trim().split(/\s+/);
  const target = args[1]?.toLowerCase();

  if (!target) {
    return message.reply("Please specify what you want to unequip! Examples: `!unequip weapon`, `!unequip armor`, or `!unequip foam-sword`");
  }

  const result = unequipItem(message.guild.id, message.author.id, target);

  if (!result.success) {
    return message.reply(`You don't have that equipped!`);
  }

  await message.reply(`🛡️ You successfully unequipped your **${result.item.name}**.`);
}