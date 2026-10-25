import { unequipItem } from "../database/items.js";

export async function unequipCommand(message) {
  const args = message.content.trim().split(/\s+/);
  const target = args[1]?.toLowerCase();

  if (!target || !["weapon", "armor"].includes(target)) {
    return message.reply("Please specify what you want to unequip! Examples: `!unequip weapon` or `!unequip armor`");
  }

  const result = unequipItem(message.guild.id, message.author.id, target);

  if (!result.success) {
    if (result.reason === "nothing_equipped") {
      return message.reply(`You don't have a ${target} currently equipped!`);
    }
  }

  await message.reply(`🛡️ You successfully unequipped your **${result.item.name}**.`);
}