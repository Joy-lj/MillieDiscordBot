import { sellItemInstance } from "../database/items.js";

export async function sellCommand(message) {
  const args = message.content.trim().split(/\s+/);
  const instanceId = parseInt(args[1], 10);

  if (isNaN(instanceId)) {
    return message.reply("Please specify the item instance ID to sell! Check `!inventory` for IDs. Example: `!sell 1`");
  }

  const result = sellItemInstance(message.guild.id, message.author.id, instanceId);

  if (!result.success) {
    return message.reply("You do not own that item instance!");
  }

  await message.reply(`💵 Success! You sold your **${result.item}** for **${result.price}** cookies. New balance: **${result.newBalance}** cookies.`);
}