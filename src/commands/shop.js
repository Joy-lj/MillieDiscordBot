import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { ITEMS, buyItem } from "../database/items.js";

export async function shopCommand(message) {
  const itemEntries = Object.entries(ITEMS);
  const itemsPerPage = 4;
  const totalPages = Math.ceil(itemEntries.length / itemsPerPage);
  let currentPage = 0;

  // Function to build the embed for a specific page
  const generateEmbed = (page) => {
    const start = page * itemsPerPage;
    const currentItems = itemEntries.slice(start, start + itemsPerPage);

    const embed = new EmbedBuilder()
      .setColor(0xffaa00)
      .setTitle("🛒 Millie's Cookie Shop")
      .setDescription(`Use \`!buy <item-id>\` to purchase items using your Millie Cookies!\nPage ${page + 1} of ${totalPages}`)
      .setTimestamp();

    for (const [id, item] of currentItems) {
      const statLabel = item.type === "weapon" ? "⚔️ Strength" : "🛡️ Defense";
      embed.addFields({
        name: `${item.name} (\`${id}\`)`,
        value: `Type: **${item.type.toUpperCase()}** | ${statLabel}: **+${item.stat}**\nPrice: **${item.price}** cookies\n*${item.description}* (Use: ${item.use})`,
        inline: false,
      });
    }

    return embed;
  };

  // Function to build the pagination buttons
  const generateRow = (page) => {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("prev_page")
        .setLabel("◀️ Previous")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId("next_page")
        .setLabel("Next ▶️")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === totalPages - 1)
    );
  };

  // If there's only 1 page, just send it without buttons
  if (totalPages <= 1) {
    return message.reply({ embeds: [generateEmbed(0)] });
  }

  // Send initial message with embed and buttons
  const reply = await message.reply({
    embeds: [generateEmbed(currentPage)],
    components: [generateRow(currentPage)],
  });

  // Create a button collector that lasts for 2 minutes
  const collector = reply.createMessageComponentCollector({
    filter: (i) => i.user.id === message.author.id,
    time: 120000,
  });

  collector.on("collect", async (interaction) => {
    if (interaction.customId === "prev_page") {
      currentPage = Math.max(currentPage - 1, 0);
    } else if (interaction.customId === "next_page") {
      currentPage = Math.min(currentPage + 1, totalPages - 1);
    }

    await interaction.update({
      embeds: [generateEmbed(currentPage)],
      components: [generateRow(currentPage)],
    });
  });

  // Disable buttons when the collector expires
  collector.on("end", () => {
    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("prev_page").setLabel("◀️ Previous").setStyle(ButtonStyle.Primary).setDisabled(true),
      new ButtonBuilder().setCustomId("next_page").setLabel("Next ▶️").setStyle(ButtonStyle.Primary).setDisabled(true)
    );
    reply.edit({ components: [disabledRow] }).catch(() => {});
  });
}

export async function buyCommand(message) {
  const args = message.content.trim().split(/\s+/);
  const itemId = args[1]?.toLowerCase();

  if (!itemId) {
    return message.reply("Please specify an item to buy! Example: `!buy foam-sword`");
  }

  const result = buyItem(message.guild.id, message.author.id, itemId);

  if (!result.success) {
    if (result.reason === "invalid_item") {
      return message.reply("That item doesn't exist! Check `!shop` for available items.");
    }
    if (result.reason === "insufficient_funds") {
      return message.reply(`You don't have enough cookies! That item costs **${result.price}** cookies.`);
    }
  }

  await message.reply(`🎉 Success! You bought a **${result.item}** for **${result.price}** cookies. Remaining balance: **${result.newBalance}** cookies.`);
}