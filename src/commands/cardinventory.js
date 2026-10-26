import db from "../database/connection.js";
import { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import path from "path";
import fs from "fs";

// Master list of all cards available in the game
const CARDS = [
  { id: "shadow_tabby", name: "🌑 Shadow Tabby", rarity: "Epic", baseName: "shadow_tabby" },
  { id: "moonglow_tabby", name: "✨ Moonglow Tabby", rarity: "Legendary", baseName: "moonglow_tabby" }
];

// Helper function to resolve local image files
function findCardImage(baseName) {
  const possibleDirs = [
    path.join(process.cwd(), "cards"),
    path.join(process.cwd(), "src", "cards"),
    path.join(process.cwd(), "images")
  ];

  const extensions = [".png", ".jpg", ".jpeg", ".PNG", ".JPG", ".JPEG"];

  for (const dir of possibleDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const ext of extensions) {
      const fullPath = path.join(dir, `${baseName}${ext}`);
      if (fs.existsSync(fullPath)) {
        return { path: fullPath, filename: `${baseName}${ext}` };
      }
    }
  }
  return null;
}

export async function cardInventoryCommand(message) {
  const guildId = message.guild.id;
  const userId = message.author.id;

  // 1. Fetch user's owned card IDs from the database
  const userCardRows = db
    .prepare("SELECT card_id FROM user_cards WHERE guild_id = ? AND user_id = ?")
    .all(guildId, userId);

  if (userCardRows.length === 0) {
    return message.reply("🎒 Your card inventory is currently empty! Use `!cardshop` to buy some.");
  }

  // 2. Map database entries to card object definitions
  const ownedCards = userCardRows
    .map((row) => CARDS.find((c) => c.id === row.card_id))
    .filter(Boolean); // Filters out any unmapped card IDs

  let currentIndex = 0;

  // Helper to generate the message layout for a single card in inventory
  const generateInventoryPayload = (index) => {
    const card = ownedCards[index];
    const cardImage = findCardImage(card.baseName);

    const embed = new EmbedBuilder()
      .setColor("#2ecc71")
      .setTitle(`🎒 ${message.author.username}'s Card Inventory`)
      .setDescription(`Viewing card **${index + 1}** of **${ownedCards.length}**`)
      .addFields(
        { name: "Card Name", value: `${card.name}`, inline: true },
        { name: "Rarity", value: `${card.rarity}`, inline: true },
        { name: "ID", value: `\`${card.id}\``, inline: true }
      )
      .setFooter({ text: "Use !sellcard <card_id> to sell an owned card" });

    let files = [];
    if (cardImage) {
      const attachment = new AttachmentBuilder(cardImage.path, { name: cardImage.filename });
      embed.setImage(`attachment://${cardImage.filename}`);
      files.push(attachment);
    }

    // Pagination buttons
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("inv_prev")
        .setLabel("◀ Prev")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(ownedCards.length <= 1),
      new ButtonBuilder()
        .setCustomId("inv_next")
        .setLabel("Next ▶")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(ownedCards.length <= 1)
    );

    return { embeds: [embed], files: files, components: [row] };
  };

  const initialMessage = await message.channel.send(generateInventoryPayload(currentIndex));

  // Listen for button presses for 60 seconds
  const collector = initialMessage.createMessageComponentCollector({
    filter: (i) => i.user.id === message.author.id,
    time: 60000,
  });

  collector.on("collect", async (interaction) => {
    if (interaction.customId === "inv_prev") {
      currentIndex = (currentIndex - 1 + ownedCards.length) % ownedCards.length;
    } else if (interaction.customId === "inv_next") {
      currentIndex = (currentIndex + 1) % ownedCards.length;
    }

    await interaction.update(generateInventoryPayload(currentIndex));
  });

  collector.on("end", async () => {
    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("inv_prev").setLabel("◀ Prev").setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId("inv_next").setLabel("Next ▶").setStyle(ButtonStyle.Secondary).setDisabled(true)
    );
    try {
      await initialMessage.edit({ components: [disabledRow] });
    } catch (e) {
      // Message was deleted
    }
  });
}