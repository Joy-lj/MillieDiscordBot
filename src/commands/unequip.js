import { unequipItemBySerial } from "../database/items.js";

export async function unequipCommand(message) {
  if (!message.inGuild() || message.author.bot) return;

  const args = message.content.trim().split(/\s+/);
  const target = args[1]?.toLowerCase();
  const serialText = args[2];

  if (!target || args.length > 3) {
    return message.reply(
      "Usage: `!unequip weapon`, `!unequip armor`, or " +
      "`!unequip <item-id> <serial-number>`"
    );
  }

  // Keep it undefined when no serial was provided.
  let serialNumber;

  if (serialText !== undefined) {
    if (!/^\d+$/.test(serialText)) {
      return message.reply("Enter a valid positive whole-number serial.");
    }

    serialNumber = Number(serialText);

    if (!Number.isSafeInteger(serialNumber) || serialNumber < 1) {
      return message.reply("Enter a valid positive whole-number serial.");
    }
  }

  let result;

  try {
    result = await unequipItemBySerial(
      message.guildId,
      message.author.id,
      target,
      serialNumber
    );
  } catch (error) {
    console.error("Unequip failed:", error);

    return message.reply(
      "Couldn't confirm the equipment change. Check your equipment before trying again."
    );
  }

  if (!result.success) {
    const errors = {
      nothing_equipped: "You don't have anything equipped in that slot!",
      not_equipped: "That item and serial are not currently equipped.",
      invalid_type: "Choose `weapon`, `armor`, or a valid equipment item ID.",
    };

    return message.reply(
      errors[result.reason] ?? "Failed to unequip gear."
    );
  }

  await message.reply({
    content: `🛡️ You successfully unequipped your **${result.item?.name ?? "gear"}**.`,
    allowedMentions: { parse: [], repliedUser: false },
  });
}