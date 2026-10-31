import { equipItemBySerial } from "../database/items.js";

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
    return message.reply(
      "Usage: `!equip <item-id> <serial-number>`\n" +
      "Example: `!equip millies-wrath 1`"
    );
  }

  const serialNumber = Number(serialText);

  if (!Number.isSafeInteger(serialNumber) || serialNumber < 1) {
    return message.reply("Enter a valid positive whole-number serial.");
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

    return message.reply(
      "Couldn't confirm the equipment change. Check your equipment before trying again."
    );
  }

  if (!result.success) {
    const errors = {
      invalid_item: "That item doesn't exist! Check `!shop` for available items.",
      not_owned: "You don't own that item and serial. Check `!inventory`.",
      invalid_type: "That item cannot be equipped as a weapon or armor.",
    };

    return message.reply(
      errors[result.reason] ?? "Failed to equip item."
    );
  }

  const isWeapon = result.item.type === "weapon";
  const statLabel = isWeapon ? "Strength" : "Defense";

  await message.reply({
    content:
      `${isWeapon ? "⚔️" : "🛡️"} You equipped ` +
      `**${result.item.name} #${result.serialNumber}**! ` +
      `(${statLabel}: +${result.item.stat})`,
    allowedMentions: { parse: [], repliedUser: false },
  });
}