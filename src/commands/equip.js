import { equipItem, ITEMS } from "../database/items.js";

export async function equipCommand(message) {
  const args = message.content.trim().split(/\s+/);
  const itemId = args[1]?.toLowerCase();

  if (!itemId) {
    return message.reply("Please specify an item to equip! Example: `!equip foam-sword`");
  }

  const result = equipItem(message.guild.id, message.author.id, itemId);

  if (!result.success) {
    if (result.reason === "invalid_item") {
      return message.reply("That item doesn't exist! Check `!shop` for valid gear.");
    }
    if (result.reason === "not_owned") {
      return message.reply("You don't own that item! Buy it from the shop or check your `!inventory`.");
    }
  }

  const statLabel = result.item.type === "weapon" ? "Strength" : "Defense";
  await message.reply(`⚔️ You successfully equipped your **${result.item.name}**! (${statLabel}: +${result.item.stat})`);
}