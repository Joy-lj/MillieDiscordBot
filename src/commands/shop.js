import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from "discord.js";

import { ITEMS, buyItem } from "../database/items.js";
import { economyConfig } from "../config/economy.js";

const quiet = { parse: [], repliedUser: false };

const money = (amount) =>
  `${amount.toLocaleString("en-US")} ${economyConfig.currencyName}`;

export async function shopCommand(message) {
  if (!message.inGuild() || message.author.bot) return;

  const itemEntries = Object.entries(ITEMS);
  const itemsPerPage = 4;
  const totalPages = Math.max(
    1,
    Math.ceil(itemEntries.length / itemsPerPage)
  );

  let currentPage = 0;

  const previousId = `shop:${message.id}:previous`;
  const nextId = `shop:${message.id}:next`;

  function generateEmbed(page) {
    const start = page * itemsPerPage;
    const currentItems = itemEntries.slice(
      start,
      start + itemsPerPage
    );

    const embed = new EmbedBuilder()
      .setColor(0xffaa00)
      .setTitle("🛒 Millie's Item Shop")
      .setDescription(
        itemEntries.length
          ? "Buy equipment using your economy balance!\n\n" +
          "`!buy foam-sword` — buy one\n" +
          "`!buy foam-sword 5` — buy five"
          : "There are no items configured yet."
      )
      .setFooter({
        text: `Page ${page + 1}/${totalPages}`,
      })
      .setTimestamp();

    for (const [id, item] of currentItems) {
      const statLabel =
        item.type === "weapon"
          ? "⚔️ Strength"
          : "🛡️ Defense";

      embed.addFields({
        name: `${item.name} (\`${id}\`)`,
        value:
          `Type: **${item.type.toUpperCase()}** | ` +
          `${statLabel}: **+${item.stat}**\n` +
          `Price: **${money(item.price)}**\n` +
          `${item.description ?? ""}` +
          (item.use ? `\nUse: ${item.use}` : ""),
        inline: false,
      });
    }

    return embed;
  }

  function generateRow(page, expired = false) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(previousId)
        .setLabel("Previous")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(expired || page === 0),

      new ButtonBuilder()
        .setCustomId(nextId)
        .setLabel("Next")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(expired || page === totalPages - 1)
    );
  }

  if (totalPages === 1) {
    return message.reply({
      embeds: [generateEmbed(0)],
      allowedMentions: quiet,
    });
  }

  const reply = await message.reply({
    embeds: [generateEmbed(currentPage)],
    components: [generateRow(currentPage)],
    allowedMentions: quiet,
  });

  const collector = reply.createMessageComponentCollector({
    filter: (interaction) =>
      interaction.isButton() &&
      [previousId, nextId].includes(interaction.customId),
    time: 120_000,
  });

  // Serialize edits so rapid button presses don't overwrite newer pages.
  let updates = Promise.resolve();

  collector.on("collect", async (interaction) => {
    try {
      if (interaction.user.id !== message.author.id) {
        await interaction.reply({
          content: "These controls belong to another player. Use !shop.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.deferUpdate();

      updates = updates
        .then(async () => {
          if (interaction.customId === previousId) {
            currentPage = Math.max(0, currentPage - 1);
          } else {
            currentPage = Math.min(
              totalPages - 1,
              currentPage + 1
            );
          }

          await reply.edit({
            embeds: [generateEmbed(currentPage)],
            components: [generateRow(currentPage)],
            allowedMentions: quiet,
          });
        })
        .catch((error) => {
          console.error("Shop pagination failed:", error);
        });
    } catch (error) {
      console.error("Shop interaction failed:", error);
    }
  });

  collector.on("end", () => {
    void updates
      .then(() =>
        reply.edit({
          components: [generateRow(currentPage, true)],
        })
      )
      .catch((error) => {
        console.error("Could not disable shop buttons:", error);
      });
  });
}

export async function buyCommand(message) {
  if (!message.inGuild() || message.author.bot) return;

  const args = message.content.trim().split(/\s+/);
  const itemId = args[1]?.toLowerCase();
  const quantityText = args[2] ?? "1";

  if (
    !itemId ||
    args.length > 3 ||
    !/^\d+$/.test(quantityText)
  ) {
    return message.reply({
      content:
        "Usage: `!buy <item-id> [quantity]`\n" +
        "Examples: `!buy foam-sword` or `!buy foam-sword 5`",
      allowedMentions: quiet,
    });
  }

  const quantity = Number(quantityText);

  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    return message.reply(
      "❌ Quantity must be a positive whole number within the supported limit."
    );
  }

  if (!ITEMS[itemId]) {
    return message.reply(
      "❌ That item doesn't exist! Check `!shop` for available items."
    );
  }

  let result;

  try {
    result = await buyItem(
      message.guildId,
      message.author.id,
      itemId,
      quantity
    );
  } catch (error) {
    console.error("Item purchase failed:", error);

    return message.reply({
      content:
        "❌ Couldn't confirm the purchase. Check your inventory and balance before trying again.",
      allowedMentions: quiet,
    });
  }

  if (!result.success) {
    if (result.reason === "invalid_item") {
      return message.reply(
        "❌ That item doesn't exist! Check `!shop`."
      );
    }

    if (result.reason === "invalid_quantity") {
      return message.reply(
        "❌ That quantity or purchase total exceeds the supported limit."
      );
    }

    if (result.reason === "insufficient_funds") {
      return message.reply({
        content:
          `❌ You don't have enough currency. ` +
          `This purchase costs **${money(result.price)}**.`,
        allowedMentions: quiet,
      });
    }

    return message.reply("❌ The purchase could not be completed.");
  }

  const shownItems = result.addedItems.slice(0, 10);
  const serials = shownItems
    .map((item) => `#${item.serial_number}`)
    .join(", ");

  const remaining = result.addedItems.length - shownItems.length;

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle("🛍️ Purchase Complete")
    .setDescription(
      `Bought **${result.quantity.toLocaleString("en-US")} × ` +
      `${result.item}**!\n\n` +
      `Total paid: **${money(result.price)}**\n` +
      `Remaining balance: **${money(result.newBalance)}**\n\n` +
      `Serial numbers: ${serials}` +
      (remaining > 0
        ? `, and ${remaining.toLocaleString("en-US")} more`
        : "")
    );

  // The purchase has committed. Sending the receipt must not repeat it.
  await message.reply({
    embeds: [embed],
    allowedMentions: quiet,
  });
}