import { sellItemBySerial } from "../database/items.js";

export async function sellCommand(message) {
  const args = message.content.trim().split(/\s+/);
  const itemId = args[1]?.toLowerCase();
  const serialNumber = parseInt(args[2], 10);

  if (!itemId || isNaN(serialNumber)) {
    return message.reply(
      "Please specify both the item and its serial number to sell!\nExample: `!sell foam-sword 1` or `!sell rusty-shank 2`"
    );
  }

  const result = await sellItemBySerial(
    message.guild.id,
    message.author.id,
    itemId,
    serialNumber
  );

  if (!result.success) {
    if (result.reason === "invalid_item") {
      return message.reply(
        "That item doesn't exist! Check `!shop` for valid items."
      );
    }
    if (result.reason === "not_owned") {
      return message.reply(
        `You don't own **${itemId} #${serialNumber}**! Check your \`!inventory\` to verify your item serial numbers.`
      );
    }
    return message.reply("Failed to sell the item.");
  }

  await message.reply(
    `💵 Success! You sold your **${result.item}** for **${result.price}** cookies. New balance: **${result.newBalance}** cookies.`
  );
}