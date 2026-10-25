import { sellItem, ITEMS } from "../database/items.js";

export async function sellCommand(message) {
  const args = message.content.trim().split(/\s+/);
  const itemId = args[1]?.toLowerCase();

  if (!itemId) {
    return message.reply("Please specify an item to sell! Example: `!sell foam-sword`");
  }

  const result = sellItem(message.guild.id, message.author.id, itemId);

  if (!result.success) {
    if (result.reason === "invalid_item") {
      return message.reply("That item doesn't exist! Check `!shop` for valid items.");
    }
    if (result.reason === "not_owned") {
      return message.reply("You don't own that item! Check your `!inventory` to see what you can sell.");
    }
  }

  await message.reply(`💵 Success! You sold your **${result.item}** for **${result.price}** cookies. New balance: **${result.newBalance}** cookies.`);
}