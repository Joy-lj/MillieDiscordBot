import { equipItemBySerial } from "../database/items.js";

const quiet = { parse: [], repliedUser: false };

export async function equipCommand(message) {
  if (!message.inGuild() || message.author.bot) return;

  const args = message.content.trim().split(/\s+/);
  const itemId = args[1]?.toLowerCase();
  const serialText = args[2];

  if (
    args.length !== 3 ||
    !itemId ||
    !/^\d+$/.test(serialText ?? "")
  ) {
    return message.reply({
      content:
        "Usage: `!equip <item-id> <serial-number>`\n" +
        "Example: `!equip millies-wrath 1`",
      allowedMentions: quiet,
    });
  }

  const serialNumber = Number(serialText);

  if (!Number.isSafeInteger(serialNumber) || serialNumber < 1) {
    return message.reply({
      content: "Enter a valid positive whole-number serial.",
      allowedMentions: quiet,
    });
  }

  let result;

  try {
    result = await equipItemBySerial(
      message.guildId,
      message.author.id,
      itemId,
      serialNumber
    );
  } catch (error) {
    console.error("Equip failed:", error);

    return message.reply({
      content:
        "Couldn't confirm the equipment change. " +
        "Check your equipment before trying again.",
      allowedMentions: quiet,
    });
  }

  if (!result.success) {
    const errors = {
      invalid_item:
        "❌ That item doesn't exist! Check `!shop` for available items.",

      not_owned:
        "❌ You don't own that item and serial. Check `!inventory`.",

      invalid_type:
        "❌ That item doesn't have a valid equipment slot.",

      two_handed_equipped:
        "❌ Unequip your two-handed weapon before equipping " +
        "an off-hand item. Use `!unequip main_hand`.",
    };

    return message.reply({
      content: errors[result.reason] ?? "❌ Failed to equip item.",
      allowedMentions: quiet,
    });
  }

  // Equipment has already been saved; do not repeat the operation
  // if sending this message fails.
  await message.reply({
    content:
      `✅ Equipped **${result.item.name} #${result.serialNumber}** ` +
      `in **${result.slot.replace(/_/g, " ")}**.` +
      (
        result.offHandUnequipped
          ? "\nYour off-hand item was unequipped and remains in your inventory."
          : ""
      ),
    allowedMentions: quiet,
  }).catch((error) => {
    console.error("Equipment saved, but confirmation failed:", error);
  });
}