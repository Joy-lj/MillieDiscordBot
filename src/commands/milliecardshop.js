/*import db from "../database/connection.js";
import { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import path from "path";
import fs from "fs";

// Define your cards
const CARDS = [
  { id: "shadow_tabby", name: "🌑 Shadow Tabby", price: 500, rarity: "Epic", sellPrice: 250, baseName: "shadow_tabby" },
  { id: "moonglow_tabby", name: "✨ Moonglow Tabby", price: 1000, rarity: "Legendary", sellPrice: 500, baseName: "moonglow_tabby" }
];

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

export async function cardShopCommand(message) {
  let currentIndex = 0;

  // Helper to generate the message payload for a given card index
  const generateShopPayload = (index) => {
    const card = CARDS[index];
    const cardImage = findCardImage(card.baseName);

    const embed = new EmbedBuilder()
      .setColor("#9b59b6")
      .setTitle("🐾 Cat Card Shop")
      .setDescription(`Viewing card **${index + 1}** of **${CARDS.length}**\n\nUse \`!buycard <card_id>\` to purchase!`)
      .addFields(
        { name: `Card Name`, value: `${card.name} (${card.rarity})`, inline: false },
        { name: `Price`, value: `**${card.price} coins**`, inline: true },
        { name: `Sell Value`, value: `**${card.sellPrice} coins**`, inline: true },
        { name: `ID`, value: `\`${card.id}\``, inline: true }
      )
      .setFooter({ text: `Requested by ${message.author.username}` });

    let files = [];
    if (cardImage) {
      const attachment = new AttachmentBuilder(cardImage.path, { name: cardImage.filename });
      embed.setImage(`attachment://${cardImage.filename}`);
      files.push(attachment);
    }

    // Navigation buttons
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("prev_card")
        .setLabel("◀ Prev")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(CARDS.length <= 1),
      new ButtonBuilder()
        .setCustomId("next_card")
        .setLabel("Next ▶")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(CARDS.length <= 1)
    );

    return { embeds: [embed], files: files, components: [row] };
  };

  const initialMessage = await message.channel.send(generateShopPayload(currentIndex));

  // Collector that listens for button clicks for 60 seconds
  const collector = initialMessage.createMessageComponentCollector({
    filter: (i) => i.user.id === message.author.id,
    time: 60000 
  });

  collector.on("collect", async (interaction) => {
    if (interaction.customId === "prev_card") {
      currentIndex = (currentIndex - 1 + CARDS.length) % CARDS.length;
    } else if (interaction.customId === "next_card") {
      currentIndex = (currentIndex + 1) % CARDS.length;
    }

    await interaction.update(generateShopPayload(currentIndex));
  });

  collector.on("end", async () => {
    // Disable buttons when timer runs out
    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("prev_card").setLabel("◀ Prev").setStyle(ButtonStyle.Primary).setDisabled(true),
      new ButtonBuilder().setCustomId("next_card").setLabel("Next ▶").setStyle(ButtonStyle.Primary).setDisabled(true)
    );
    try {
      await initialMessage.edit({ components: [disabledRow] });
    } catch (e) {
      // Message might have been deleted
    }
  });
}

export async function buyCardCommand(message) {
  const args = message.content.trim().split(/\s+/);
  const cardId = args[1]?.toLowerCase();

  if (!cardId) {
    return message.reply("❌ Please specify a card to buy! Example: `!buycard shadow_tabby`");
  }

  const card = CARDS.find(c => c.id === cardId);
  if (!card) {
    return message.reply("❌ That card doesn't exist! Check `!cardshop` to see available cards.");
  }

  const guildId = message.guild.id;
  const userId = message.author.id;

  let account = db.prepare("SELECT balance FROM accounts WHERE guild_id = ? AND user_id = ?").get(guildId, userId);
  
  if (!account || account.balance < card.price) {
    const currentBal = account ? account.balance : 0;
    return message.reply(`❌ You need **${card.price}** coins, but you only have **${currentBal}** coins.`);
  }

  const existingCard = db.prepare("SELECT 1 FROM user_cards WHERE guild_id = ? AND user_id = ? AND card_id = ?").get(guildId, userId, card.id);
  if (existingCard) {
    return message.reply(`❌ You already own the **${card.name}** card!`);
  }

  const transaction = db.transaction(() => {
    db.prepare("UPDATE accounts SET balance = balance - ? WHERE guild_id = ? AND user_id = ?").run(card.price, guildId, userId);
    db.prepare("INSERT INTO user_cards (guild_id, user_id, card_id) VALUES (?, ?, ?)").run(guildId, userId, card.id);
  });

  transaction();

  const cardImage = findCardImage(card.baseName);
  let files = [];
  if (cardImage) {
    files.push(new AttachmentBuilder(cardImage.path));
  }

  return message.reply({
    content: `🎉 Success! You purchased the **${card.name}** card for **${card.price}** coins!`,
    files: files
  });
}

export async function sellCardCommand(message) {
  const args = message.content.trim().split(/\s+/);
  const cardId = args[1]?.toLowerCase();

  if (!cardId) {
    return message.reply("❌ Please specify which card to sell! Example: `!sellcard shadow_tabby`");
  }

  const card = CARDS.find(c => c.id === cardId);
  if (!card) {
    return message.reply("❌ That card doesn't exist!");
  }

  const guildId = message.guild.id;
  const userId = message.author.id;

  const ownedCard = db.prepare("SELECT 1 FROM user_cards WHERE guild_id = ? AND user_id = ? AND card_id = ?").get(guildId, userId, card.id);
  
  if (!ownedCard) {
    return message.reply(`❌ You don't own the **${card.name}** card to sell!`);
  }

  const sellValue = card.sellPrice;

  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM user_cards WHERE guild_id = ? AND user_id = ? AND card_id = ?").run(guildId, userId, card.id);
    db.prepare("UPDATE accounts SET balance = balance + ? WHERE guild_id = ? AND user_id = ?").run(sellValue, guildId, userId);
  });

  transaction();

  return message.reply(`💰 Success! You sold your **${card.name}** card for **${sellValue}** coins.`);
}*/