import { spawnItem } from "../database/adminItems.js";

// Only these Discord USER IDs can spawn items. Replace/edit as needed.
const ADMIN_IDS = new Set([
  "428738370022277121",
  "813870343767982100",
]);

const quiet = { parse: [], repliedUser: false };

export async function spawnItemCommand(message) {
  if (!message.inGuild() || message.author.bot) return;

  if (!ADMIN_IDS.has(message.author.id)) {
    return message.reply({
      content: "❌ You are not authorized to spawn items.",
      allowedMentions: quiet,
    });
  }

  const args = message.content.trim().split(/\s+/);
  const targetId = args[1]?.match(/^<@!?(\d{17,20})>$/)?.[1]
    ?? (/^\d{17,20}$/.test(args[1] ?? "") ? args[1] : null);
  const itemId = args[2]?.toLowerCase();
  const quantityText = args[3] ?? "1";
  const quantity = Number(quantityText);

  if (
    args.length < 3 || args.length > 4 || !targetId || !itemId ||
    !/^\d+$/.test(quantityText) || !Number.isSafeInteger(quantity) ||
    quantity < 1 || quantity > 100
  ) {
    return message.reply({
      content: "Usage: `!spawnitem @member <item-id> [quantity]`\n" +
        "Example: `!spawnitem @Victor millies-wrath 1`\n" +
        "You can also use a member's Discord ID. Quantity: 1–100.",
      allowedMentions: quiet,
    });
  }

  let member;
  try {
    member = await message.guild.members.fetch(targetId);
  } catch (error) {
    console.error("Spawn recipient lookup failed:", error);
    return message.reply({
      content: "❌ Couldn't verify that member is in this server. No items were granted.",
      allowedMentions: quiet,
    });
  }
  if (member.user.bot) {
    return message.reply({ content: "❌ Choose a player rather than a bot.", allowedMentions: quiet });
  }

  let result;
  try {
    result = await spawnItem(message.guildId, member.id, itemId, quantity);
  } catch (error) {
    console.error("Item spawn failed:", error);
    return message.reply({
      content: "❌ Couldn't confirm the grant. Check that player's inventory before trying again.",
      allowedMentions: quiet,
    });
  }

  if (!result.success) {
    return message.reply({
      content: result.reason === "invalid_item"
        ? "❌ Unknown item ID. Use an exact ID from your ITEMS config."
        : "❌ Quantity must be a whole number from 1 to 100.",
      allowedMentions: quiet,
    });
  }

  console.info("[spawnitem]", {
    adminId: message.author.id, guildId: message.guildId,
    recipientId: member.id, itemId, quantity,
    instanceIds: result.addedItems.map(item => item.id),
  });

  const serials = result.addedItems.slice(0, 10)
    .map(item => `#${item.serial_number}`).join(", ");
  // The grant has committed. A failed receipt must not retry the insert.
  await message.reply({
    content: `✅ Spawned **${quantity} × ${result.item}** for <@${member.id}>.\n` +
      `Serials: ${serials}${quantity > 10 ? ` (+${quantity - 10} more)` : ""}\n`,
    allowedMentions: quiet,
  }).catch(error => console.error("Items granted but receipt failed:", error));
}
