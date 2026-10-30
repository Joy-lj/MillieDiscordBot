import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  MessageFlags, StringSelectMenuBuilder,
} from "discord.js";
import { cardShop } from "../database/cardShop.js";
import { economyConfig } from "../config/economy.js";
import { groupLabels } from "../config/cardShop.js";
import { CardShopError } from "../../services/cardShopStore.js";
import { renderCard } from "../cards/renderCard.js";
import { renderCardGrid } from "../cards/renderCardGrid.js";


const quiet = { parse: [], repliedUser: false };
const money = (n) => `${n.toLocaleString("en-US")} ${economyConfig.currencyName}`;
const clean = (s, max = 80) => String(s ?? "").slice(0, max).replace(/([\\`*_~|>])/g, "\\$1");
const cid = (u, action, target = "-", page = 0) => `cs:${u}:${action}:${target}:${page}`;
const button = (u, label, action, target = "-", page = 0, style = ButtonStyle.Secondary, disabled = false) =>
  new ButtonBuilder().setCustomId(cid(u, action, target, page)).setLabel(label).setStyle(style).setDisabled(disabled);
const row = (...buttons) => new ActionRowBuilder().addComponents(buttons);
const payload = (embed, components = []) => ({ embeds: [embed], components, allowedMentions: quiet, files: [] });

function slotText(slots) {
  return slots.map((weights, i) => {
    const total = Object.values(weights).reduce((s, w) => s + w, 0);
    return `**${i + 1}.** ${Object.entries(weights).map(([group, w]) =>
      `${groupLabels[group]} ${(w / total * 100).toFixed(1)}%`).join(" / ")}`;
  }).join("\n");
}

async function shopView(user, page = 0) {
  const offers = await cardShop.offers();
  page = Math.max(0, Math.min(page, offers.length - 1));
  const pack = offers[page];
  if (!pack) throw new CardShopError("No packs configured.");
  const embed = new EmbedBuilder().setTitle(`🛍️ Card Shop — ${pack.name}`).setColor(pack.color)
    .setDescription(`${pack.description}\n\nBuy 1: **${money(pack.price)}**\nBuy 5: **${money(pack.price * 5)}**\nBuy 10: **${money(pack.price * 10)}**\nUnopened sell-back: **${money(pack.sellPrice)} per pack**`)
    .addFields({ name: "Slot odds", value: slotText(pack.slots) },
      { name: "Source sets", value: pack.setIds.join(", ") },
      { name: "Availability", value: pack.ready ? "Ready" : clean(pack.reason, 240) })
    .setFooter({ text: `Pack ${page + 1}/${offers.length} • Special = all other TCGdex rarity labels • Custom virtual odds` });
  return payload(embed, [
    row(...[1, 5, 10].map((quantity) => button(user,
      `Buy ${quantity} · ${(pack.price * quantity).toLocaleString("en-US")}`,
      "buy", `${pack.id}~${pack.quote ?? "unavailable"}~${quantity}`, 0, ButtonStyle.Success, !pack.ready))),
    row(
      button(user, "Previous", "shop", "-", page - 1, ButtonStyle.Secondary, page === 0),
      button(user, "Next", "shop", "-", page + 1, ButtonStyle.Secondary, page === offers.length - 1),
      button(user, "My packs", "packs"), button(user, "My cards", "cards"),
    )]);
}

async function packsView(guild, user, page = 0) {
  const inventory = await cardShop.listPacks(guild, user, page);
  const embed = new EmbedBuilder().setTitle("🎒 Your Unopened Packs").setColor(0x39c995)
    .setDescription(inventory.total ? inventory.rows.map((pack, i) =>
      `**${i + 1}. ${clean(pack.snapshot.name)}** — sell for ${money(pack.snapshot.sellPrice)}`
    ).join("\n") : "You don't have any unopened packs. Visit `!cardshop`.")
    .setFooter({ text: `${inventory.total} unopened • Page ${inventory.page + 1}/${inventory.pages}` });
  const components = [];
  if (inventory.rows.length) components.push(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(cid(user, "pick")).setPlaceholder("Select a pack to open or sell")
      .addOptions(inventory.rows.map((pack, i) => ({
        label: `${i + 1}. ${pack.snapshot.name}`.slice(0, 100),
        description: `${pack.snapshot.slots.length} cards • Sell for ${money(pack.snapshot.sellPrice)}`.slice(0, 100), value: pack.id
      })))
  ));
  components.push(row(
    button(user, "Previous", "packs", "-", inventory.page - 1, ButtonStyle.Secondary, inventory.page === 0),
    button(user, "Next", "packs", "-", inventory.page + 1, ButtonStyle.Secondary, inventory.page === inventory.pages - 1),
    button(user, "Shop", "shop"), button(user, "My cards", "cards"),
  ));
  return payload(embed, components);
}

async function packView(guild, user, id) {
  const { owned, count } = await cardShop.packGroup(guild, user, id);
  const pack = owned.snapshot;
  const embed = new EmbedBuilder().setTitle(`📦 ${pack.name}`).setColor(pack.color ?? 0x39c995)
    .setDescription(`Opening consumes this pack and saves **${pack.slots.length} cards**.\n` +
      `You own **${count}** unopened packs of this type.\n` +
      `Open All opens only this type. Each pack keeps its own saved odds.\n` +
      `Sell this one unopened pack for **${money(pack.sellPrice)}**.`)
    .addFields({ name: "Saved slot odds", value: slotText(pack.slots) })
    .setFooter({ text: `Pack ${id.slice(0, 8)} • Odds were locked at purchase` });
  return payload(embed, [row(
    button(user, "Open 1", "open", id, 0, ButtonStyle.Success),
    button(user, "Open 5", "open", `${id}~5`, 0, ButtonStyle.Success, count < 5),
    button(user, "Open 10", "open", `${id}~10`, 0, ButtonStyle.Success, count < 10),
    button(user, `Open all (${count})`, "open", `${id}~all`, 0, ButtonStyle.Success),
  ), row(
    button(user, `Sell 1 · ${pack.sellPrice.toLocaleString("en-US")}`, "sell", id, 0, ButtonStyle.Danger),
    button(user, "My packs", "packs"),
  )]);
}

async function attachCard(data, item) {
  try {
    const png = await renderCard(item.card, item.copyId);
    data.files = [new AttachmentBuilder(png, { name: "card.png" })];
    data.embeds[0].setImage("attachment://card.png");
  } catch (error) {
    console.error("Card render failed; keeping awarded card:", error);
    data.embeds[0].addFields({ name: "Image unavailable", value: "Your card is saved. View it again with !cards." });
  }
  return data;
}

async function openingView(guild, user, openingId, page = 0) {
  const opened = await cardShop.opening(guild, user, openingId);
  page = Math.max(0, Math.min(page, opened.cards.length - 1));
  const item = opened.cards[page];
  const summaryStart = Math.floor(page / 10) * 10;
  const summary = opened.cards.slice(summaryStart, summaryStart + 10);
  const embed = new EmbedBuilder().setTitle(`✨ Opened ${opened.name}`).setColor(0xf4bd51)
    .setDescription(`Opened **${opened.quantity ?? 1} pack(s)** and saved **${opened.cards.length} cards**.\n\n` +
      summary.map((pull, i) => `${summaryStart + i === page ? "▶" : "•"} ${summaryStart + i + 1}. **${clean(pull.card.name, 40)}** — ${clean(pull.card.rarity, 25)}`).join("\n"))
    .setFooter({ text: `Pull ${page + 1}/${opened.cards.length} • All cards are already saved to your collection` });
  const data = payload(embed, [row(
    button(user, "Previous card", "reveal", openingId, page - 1, ButtonStyle.Secondary, page === 0),
    button(user, "Next card", "reveal", openingId, page + 1, ButtonStyle.Secondary, page === opened.cards.length - 1),
    button(user, "My packs", "packs"), button(user, "My cards", "cards"),
  )]);
  return attachCard(data, item);
}

async function cardsView(guild, user, page = 0) {
  const collection = await cardShop.listCards(guild, user, page);
  const first = collection.page * collection.pageSize + 1;
  const last = first + collection.items.length - 1;
  const embed = new EmbedBuilder().setTitle("🃏 Your Card Collection").setColor(0x63acff)
    .setDescription(collection.total
      ? `Showing **${first}–${last}** of **${collection.total}** cards.\n` +
      "Select a numbered card below to see its full image and Copy ID."
      : "No cards yet. Open a pack with `!packs`.")
    .setFooter({ text: `Page ${collection.page + 1}/${collection.pages} • Up to 50 cards per page` });
  const components = [];
  for (let offset = 0; offset < collection.items.length; offset += 25) {
    const choices = collection.items.slice(offset, offset + 25);
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(cid(user, "cardpick", String(offset / 25), collection.page))
        .setPlaceholder(`View card ${first + offset}–${first + offset + choices.length - 1}`)
        .addOptions(choices.map((item, i) => ({
          label: `${first + offset + i}. ${item.card.name}`.slice(0, 100),
          description: `${item.card.rarity} • ${item.card.set?.name ?? "Unknown set"} • ${item.copyId.slice(0, 8)}`.slice(0, 100),
          value: item.copyId,
        })))
    ));
  }
  components.push(row(
    button(user, "Previous page", "cards", "-", collection.page - 1, ButtonStyle.Secondary, collection.page === 0),
    button(user, "Next page", "cards", "-", collection.page + 1, ButtonStyle.Secondary, collection.page === collection.pages - 1),
    button(user, "My packs", "packs"), button(user, "Shop", "shop"),
  ));
  const data = payload(embed, components);
  if (collection.items.length) {
    try {
      const grid = await renderCardGrid(collection.items, { startNumber: first });
      data.files = [new AttachmentBuilder(grid.image, { name: "collection.jpg" })];
      embed.setImage("attachment://collection.jpg");
      if (grid.missing) embed.addFields({
        name: "Some artwork is unavailable", value:
          `${grid.missing} thumbnail(s) could not load. The numbered cards are still selectable below.`
      });
    } catch (error) {
      console.error("Collection grid failed:", error);
      embed.addFields({ name: "Grid unavailable", value: "Use the dropdowns to view individual cards. Your collection is saved." });
    }
  }
  return data;
}

async function singleCardView(guild, user, copyId, collectionPage = 0) {
  const item = await cardShop.ownedCard(guild, user, copyId);
  const embed = new EmbedBuilder().setTitle(`🃏 ${clean(item.card.name)}`).setColor(0x63acff)
    .setDescription(`**${clean(item.card.rarity)}** • ${clean(item.card.set?.name)}\nCopy ID: \`${item.copyId}\``)
    .setFooter({ text: "Select Back to collection to return to your 50-card page" });
  const data = payload(embed, [row(
    button(user, "Back to collection", "cards", "-", collectionPage),
    button(user, "My packs", "packs"), button(user, "Shop", "shop"),
  )]);
  return attachCard(data, item);
}

export async function cardShopCommand(message) {
  if (!message.inGuild() || message.author.bot) return;
  await message.reply(await shopView(message.author.id));
}

export async function packsCommand(message) {
  if (!message.inGuild() || message.author.bot) return;
  await message.reply(
    await packsView(message.guildId, message.author.id)
  );
}

export async function cardsCommand(message) {
  if (!message.inGuild() || message.author.bot) return;
  const loading = await message.reply({ content: "Loading your card collection…", allowedMentions: quiet });
  try {
    await loading.edit({ ...await cardsView(message.guildId, message.author.id), content: null, attachments: [] });
  } catch (error) {
    console.error("Collection failed:", error);
    await loading.edit({ content: "Could not load your collection. Try !cards again.", embeds: [], components: [] });
  }
}

// Register this once in your existing InteractionCreate handler. No collectors.
export async function handleCardShopInteraction(interaction) {
  if (!interaction.isMessageComponent() || !interaction.customId.startsWith("cs:")) return false;
  const [, owner, action, target, pageText] = interaction.customId.split(":");
  if (!interaction.inGuild() || interaction.user.id !== owner) {
    await interaction.reply({ content: "These controls belong to another player. Run !cardshop or !packs yourself.", flags: MessageFlags.Ephemeral });
    return true;
  }
  const page = /^-?\d+$/.test(pageText ?? "") ? Number(pageText) : 0;
  if (!Number.isSafeInteger(page) || Math.abs(page) > 1_000_000) return true;
  const navigation = ["shop", "packs", "pick", "cards", "cardpick", "reveal"].includes(action);
  if (navigation) await interaction.deferUpdate();
  else await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guild = interaction.guildId, user = interaction.user.id;
  let committed = false;
  try {
    let data;
    if (action === "shop") {
      data = await shopView(user, page);
    } else if (action === "packs") {
      data = await packsView(guild, user, page);
    } else if (
      action === "pick" &&
      interaction.isStringSelectMenu()
    ) {
      data = await packView(guild, user, interaction.values[0]);
    }
    else if (action === "cards") data = await cardsView(guild, user, page);
    else if (action === "cardpick" && interaction.isStringSelectMenu()) {
      data = await singleCardView(guild, user, interaction.values[0], page);
    }
    else if (action === "reveal") data = await openingView(guild, user, target, page);
    else if (action === "buy") {
      const [offerId, quote, quantityText = "1"] = target.split("~");
      if (!quote) throw new CardShopError("Refresh !cardshop before buying.");
      const quantity = Number(quantityText);
      const receipt = await cardShop.buy(
        guild,
        user,
        offerId,
        interaction.id,
        quote,
        quantity
      );

      committed = true;

      data = await packView(guild, user, receipt.packId);
      const details = data.embeds[0].data.description;
      data.embeds[0].setDescription(
        `✅ Bought **${quantity} × ${clean(receipt.name)}** for **${money(receipt.price)}**.\n` +
        `Balance: **${money(receipt.balance)}**.\n\n${details}`
      );
    } else if (action === "open") {
      const [packId, countText = "1"] = target.split("~");
      const quantity = countText === "all" ? "all" : Number(countText);
      await cardShop.openMany(
        guild,
        user,
        packId,
        interaction.id,
        quantity
      );

      committed = true;

      data = await openingView(guild, user, interaction.id);
    } else if (action === "sell") {
      const receipt = await cardShop.sell(
        guild,
        user,
        target,
        interaction.id
      );

      committed = true;
      data = payload(new EmbedBuilder().setTitle("💰 Pack Sold").setColor(0x39c995)
        .setDescription(`Sold **${receipt.name}** for **${money(receipt.price)}**.\nBalance: **${money(receipt.balance)}**.`),
        [row(button(user, "My packs", "packs"), button(user, "Shop", "shop"))]);
    } else throw new CardShopError("Unknown control. Run !cardshop again.");
    await interaction.editReply({ ...data, attachments: [] });
  } catch (error) {
    console.error("Cardshop interaction failed:", error);
    const text = committed ? "The action completed, but the display failed. Check !packs or !cards. It was not repeated or refunded." :
      error instanceof CardShopError ? error.message : "The action failed. Refresh !packs or check the bot log.";
    await interaction.editReply({ content: text, embeds: [], components: [], attachments: [] }).catch(console.error);
  }
  return true;
}
