import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} from "discord.js";
import { randomUUID } from "node:crypto";
import { ITEMS, buyItem } from "../database/items.js";
import { economyConfig } from "../config/economy.js";

const quiet = { parse: [], repliedUser: false };
const ITEMS_PER_PAGE = 4;
const MAX_QUANTITY = 100;
const SHOP_TIMEOUT = 120_000;
const CONFIRM_TIMEOUT = 60_000;
const MODAL_TIMEOUT = 180_000;
const money = (amount) => `${amount.toLocaleString("en-US")} ${economyConfig.currencyName}`;
const clean = (value, max = 100) => String(value ?? "").slice(0, max).replace(/([\\`*_~|>])/g, "\\$1");
const row = (...components) => new ActionRowBuilder().addComponents(components);
const canBuy = (item) => item && item.purchasable !== false && item.source !== "dungeon";
const ownItem = (id) => Object.hasOwn(ITEMS, id) ? ITEMS[id] : null;
const button = (id, label, style = ButtonStyle.Secondary, disabled = false) =>
  new ButtonBuilder().setCustomId(id).setLabel(label.slice(0, 80)).setStyle(style).setDisabled(disabled);

function normalize(value) {
  return String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function parsePurchase(content) {
  const tokens = content.trim().split(/\s+/).slice(1);
  let quantity = 1;
  if (tokens.length && /^[+-]?\d+(?:\.\d+)?$/.test(tokens.at(-1))) {
    quantity = Number(tokens.pop());
  }
  const query = tokens.join(" ").replace(/^(["'])(.*)\1$/, "$2").trim();
  if (!query || !normalize(query)) throw new Error("Usage: `!buy <name or item-id> [quantity]` — for example `!buy feather 2`.");
  validateQuantity(quantity);
  return { query, quantity };
}

function validateQuantity(quantity) {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    throw new Error(`Choose a whole-number quantity from 1 to ${MAX_QUANTITY}.`);
  }
}

function findItems(query) {
  const entries = Object.entries(ITEMS).filter(([, item]) => canBuy(item));
  const raw = query.trim().toLowerCase();
  const exactId = entries.find(([id]) => id.toLowerCase() === raw);
  if (exactId) return [exactId];
  const key = normalize(query);
  if (!key) return [];
  const exact = entries.filter(([id, item]) => normalize(id) === key || normalize(item.name) === key);
  if (exact.length) return exact;
  const terms = key.split(" ");
  return entries.filter(([id, item]) => {
    const haystack = `${normalize(id)} ${normalize(item.name)}`;
    return terms.every((term) => haystack.includes(term) ||
      (term.length > 3 && term.endsWith("s") && !term.endsWith("ss") && haystack.includes(term.slice(0, -1))));
  });
}

function itemDetails(item) {
  const d = item.dungeon ?? {};
  const primary = item.type === "weapon" ? `⚔️ Attack +${item.stat}` : `🛡️ Defense +${item.stat}`;
  const extras = [];
  if (d.passive?.name) extras.push(d.passive.name);
  if (d.healthBonus != null) extras.push(`HP +${d.healthBonus}`);
  if (d.speedBonus != null) extras.push(`Speed ${d.speedBonus >= 0 ? "+" : ""}${d.speedBonus}`);
  if (d.critChance != null) extras.push(`Crit ${Math.round(d.critChance * 100)}%`);
  return `${primary}${extras.length ? ` • ${extras.join(" • ")}` : ""}`;
}

function ownerFilter(owner, allowedIds, isSelect = false) {
  return (interaction) => {
    if (!(isSelect ? interaction.isStringSelectMenu() : interaction.isButton()) || !allowedIds.includes(interaction.customId)) return false;
    if (interaction.user.id !== owner) {
      void interaction.reply({ content: "These controls belong to another player. Use !shop or !buy yourself.", flags: MessageFlags.Ephemeral }).catch(console.error);
      return false;
    }
    return true;
  };
}

async function notifyError(interaction, content) {
  const data = { content, flags: MessageFlags.Ephemeral, allowedMentions: quiet };
  try {
    if (interaction.deferred || interaction.replied) await interaction.followUp(data);
    else await interaction.reply(data);
  } catch (error) { console.error("Shop error message failed:", error); }
}

function failureText(result) {
  if (result.reason === "insufficient_funds") return `❌ You need **${money(result.price)}** for this purchase.`;
  if (result.reason === "dungeon_only") return "That equipment can only drop from dungeons.";
  if (result.reason === "invalid_item") return "That item is no longer available. Refresh !shop.";
  if (result.reason === "invalid_quantity") return "That quantity or purchase total exceeds the supported limit.";
  return "The purchase could not be completed.";
}

function receiptView(result) {
  const shown = result.addedItems.slice(0, 10);
  const rest = result.addedItems.length - shown.length;
  return {
    content: null,
    embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle("🛍️ Purchase Complete")
      .setDescription(
        `Bought **${result.quantity.toLocaleString("en-US")} × ${clean(result.item)}**!\n\n` +
        `Total paid: **${money(result.price)}**\nBalance: **${money(result.newBalance)}**\n\n` +
        `Serials: ${shown.map((item) => `#${item.serial_number}`).join(", ")}` +
        (rest ? `, and ${rest.toLocaleString("en-US")} more` : "")
      )],
    components: [], allowedMentions: quiet,
  };
}

// A one-use confirmation collector performs at most one purchase. It is consumed
// before awaiting buyItem. A failed response never retries the currency mutation.
async function purchasePreview({ guild, owner, itemId, quantity, send, edit }) {
  validateQuantity(quantity);
  const item = ownItem(itemId);
  if (!canBuy(item)) throw new Error("That item is unavailable in the shop; dungeon gear must be earned from clears.");
  const unitPrice = item.price;
  const total = unitPrice * quantity;
  if (!Number.isSafeInteger(total) || total < 1) throw new Error("Purchase total exceeds the supported limit.");
  const prefix = `ebuy:${randomUUID()}`;
  const confirmId = `${prefix}:confirm`;
  const cancelId = `${prefix}:cancel`;
  const preview = await send({
    embeds: [new EmbedBuilder().setColor(0xffaa00).setTitle("Confirm Item Purchase")
      .setDescription(
        `**${quantity.toLocaleString("en-US")} × ${clean(item.name)}**\n` +
        `${itemDetails(item)}\n\nUnit price: **${money(unitPrice)}**\n` +
        `Total: **${money(total)}**\n\nConfirm within 60 seconds to purchase.`
      )],
    components: [row(button(confirmId, "Confirm purchase", ButtonStyle.Success), button(cancelId, "Cancel", ButtonStyle.Danger))],
    allowedMentions: quiet,
  });
  // Ephemeral previews must edit through their originating interaction webhook.
  const update = edit ?? ((data) => preview.edit(data));
  let click;
  try {
    click = await preview.awaitMessageComponent({ filter: ownerFilter(owner, [confirmId, cancelId]), time: CONFIRM_TIMEOUT });
  } catch (error) {
    if (error.code !== "InteractionCollectorError") throw error;
    await update({ content: "Purchase confirmation expired. No purchase was made.", embeds: [], components: [], allowedMentions: quiet }).catch(console.error);
    return;
  }
  await click.deferUpdate();
  if (click.customId === cancelId) {
    await update({ content: "Purchase canceled. No currency was spent.", embeds: [], components: [], allowedMentions: quiet }).catch(console.error);
    return;
  }
  // Do not silently charge a new price if code was hot-reloaded or config mutated.
  if (!canBuy(ownItem(itemId)) || ITEMS[itemId].price !== unitPrice) {
    await update({ content: "This item's price changed. Refresh !shop and review the new price.", embeds: [], components: [], allowedMentions: quiet }).catch(console.error);
    return;
  }
  let result;
  try {
    result = await buyItem(guild, owner, itemId, quantity);
  } catch (error) {
    console.error("Item purchase could not be confirmed:", error);
    await update({ content: "Couldn't confirm the purchase. Check your inventory and balance before trying again.", embeds: [], components: [], allowedMentions: quiet }).catch(console.error);
    return;
  }
  // Display failures are handled separately; never call buyItem a second time.
  try {
    await update(result.success ? receiptView(result) : {
      content: failureText(result), embeds: [], components: [], allowedMentions: quiet,
    });
  } catch (error) { console.error("Purchase finished but receipt display failed:", error); }
}

async function quantityModal(interaction, itemId, guild, owner) {
  const item = ownItem(itemId);
  if (!canBuy(item)) { await notifyError(interaction, "That item cannot be bought. Dungeon gear must be earned from clears."); return; }
  const modalId = `eqmodal:${interaction.id}`;
  const input = new TextInputBuilder().setCustomId("quantity").setLabel(`Quantity (1–${MAX_QUANTITY})`)
    .setStyle(TextInputStyle.Short).setRequired(true).setValue("1").setMaxLength(String(MAX_QUANTITY).length);
  const modal = new ModalBuilder().setCustomId(modalId).setTitle(`Buy ${item.name}`.slice(0, 45))
    .addComponents(row(input));
  await interaction.showModal(modal);
  let submitted;
  try {
    submitted = await interaction.awaitModalSubmit({
      filter: (submission) => submission.customId === modalId && submission.user.id === owner,
      time: MODAL_TIMEOUT,
    });
  } catch (error) {
    if (error.code !== "InteractionCollectorError") throw error;
    return; // Closing/ignoring the modal spends nothing.
  }
  await submitted.deferReply({ flags: MessageFlags.Ephemeral });
  const raw = submitted.fields.getTextInputValue("quantity").trim();
  try {
    if (!/^\d+$/.test(raw)) throw new Error(`Enter a whole-number quantity from 1 to ${MAX_QUANTITY}.`);
    const quantity = Number(raw);
    validateQuantity(quantity);
    await purchasePreview({ guild, owner, itemId, quantity,
      send: (data) => submitted.editReply(data), edit: (data) => submitted.editReply(data) });
  } catch (error) {
    console.error("Shop quantity/preview failed:", error);
    await submitted.editReply({ content: error.message, embeds: [], components: [], allowedMentions: quiet }).catch(console.error);
  }
}

function shopView(entries, page, prefix, expired = false) {
  const pages = Math.max(1, Math.ceil(entries.length / ITEMS_PER_PAGE));
  const shown = entries.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);
  const embed = new EmbedBuilder().setColor(0xffaa00).setTitle("🛒 Millie's Item Shop")
    .setDescription(entries.length ? "Choose **Buy** below an item, enter a quantity, then review the total.\n" +
      "Text shortcuts also work: `!buy feather` or `!buy wrath 2`." : "There are no items configured yet.")
    .setFooter({ text: `Page ${page + 1}/${pages} • Controls expire after 2 minutes` });
  for (const [, item] of shown) {
    embed.addFields({ name: item.name, value: `${itemDetails(item)}\nPrice: **${money(item.price)}**\n` +
      `${clean(item.description, 250)}${item.dungeon?.ability?.name ? `\nSkill: ${clean(item.dungeon.ability.name)}` : ""}`, inline: false });
  }
  const components = [];
  if (shown.length) components.push(row(...shown.map(([id, item]) => button(`${prefix}:buy:${id}`, `Buy ${item.name}`, ButtonStyle.Success, expired))));
  if (pages > 1) components.push(row(
    button(`${prefix}:previous`, "Previous", ButtonStyle.Primary, expired || page === 0),
    button(`${prefix}:next`, "Next", ButtonStyle.Primary, expired || page === pages - 1)
  ));
  return { embeds: [embed], components, allowedMentions: quiet };
}

export async function shopCommand(message) {
  if (!message.inGuild() || message.author.bot) return;
  const entries = Object.entries(ITEMS).filter(([, item]) => canBuy(item));
  const prefix = `eshop:${message.id}`;
  const reply = await message.reply(shopView(entries, 0, prefix));
  if (!entries.length) return;
  const pages = Math.max(1, Math.ceil(entries.length / ITEMS_PER_PAGE));
  let page = 0;
  let edits = Promise.resolve();
  const collector = reply.createMessageComponentCollector({
    time: SHOP_TIMEOUT,
    filter: (i) => i.isButton() && i.customId.startsWith(`${prefix}:`),
  });
  collector.on("collect", async (interaction) => {
    try {
      if (interaction.user.id !== message.author.id) {
        await notifyError(interaction, "These shop controls belong to another player. Use !shop."); return;
      }
      if (interaction.customId.startsWith(`${prefix}:buy:`)) {
        const itemId = interaction.customId.slice(`${prefix}:buy:`.length);
        // Only items visible on the clicked page may open a purchase dialog.
        if (!entries.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE).some(([id]) => id === itemId)) {
          await notifyError(interaction, "That shop page changed. Choose an item from the current page."); return;
        }
        await quantityModal(interaction, itemId, message.guildId, message.author.id);
        return;
      }
      if (![`${prefix}:previous`, `${prefix}:next`].includes(interaction.customId)) return;
      await interaction.deferUpdate();
      edits = edits.then(async () => {
        page = Math.max(0, Math.min(pages - 1, page + (interaction.customId === `${prefix}:next` ? 1 : -1)));
        await reply.edit(shopView(entries, page, prefix, collector.ended));
      }).catch((error) => console.error("Shop pagination failed:", error));
    } catch (error) {
      console.error("Shop button failed:", error);
      await notifyError(interaction, "The shop action could not complete. Use !shop to try again.");
    }
  });
  collector.on("end", () => {
    void edits.then(() => reply.edit(shopView(entries, page, prefix, true))).catch(console.error);
  });
}

async function matchingItems(message, matches, quantity) {
  const prefix = `ematch:${message.id}`;
  const selectId = `${prefix}:pick`;
  let page = 0;
  const pages = Math.ceil(matches.length / 25);
  const allowed = new Set(matches.map(([id]) => id));
  function view(expired = false) {
    const shown = matches.slice(page * 25, (page + 1) * 25);
    const menu = new StringSelectMenuBuilder().setCustomId(selectId).setPlaceholder("Choose the exact item you meant").setDisabled(expired)
      .addOptions(shown.map(([id, item]) => ({ label: item.name.slice(0, 100),
        description: `${money(item.price)} each • ${item.type}`.slice(0, 100), value: id })));
    const components = [row(menu)];
    if (pages > 1) components.push(row(
      button(`${prefix}:previous`, "Previous matches", ButtonStyle.Secondary, expired || page === 0),
      button(`${prefix}:next`, "Next matches", ButtonStyle.Secondary, expired || page === pages - 1)
    ));
    return { content: `Found **${matches.length} matches**. Choose one to review a purchase of **${quantity}**. Page ${page + 1}/${pages}.`, components, allowedMentions: quiet };
  }
  const reply = await message.reply(view());
  let edits = Promise.resolve();
  const collector = reply.createMessageComponentCollector({ time: SHOP_TIMEOUT,
    filter: (i) => (i.isButton() || i.isStringSelectMenu()) && i.customId.startsWith(`${prefix}:`) });
  collector.on("collect", async (interaction) => {
    try {
      if (interaction.user.id !== message.author.id) { await notifyError(interaction, "Use !buy yourself to choose an item."); return; }
      if (interaction.customId === selectId && interaction.isStringSelectMenu()) {
        const itemId = interaction.values[0];
        if (!allowed.has(itemId)) { await notifyError(interaction, "That item is not one of the matches."); return; }
        // Consume the selection before awaiting acknowledgement or purchase UI.
        collector.stop("selected");
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await edits;
        await reply.edit({ content: "Item selected. Review your private purchase confirmation.", components: [], allowedMentions: quiet }).catch(console.error);
        await purchasePreview({ guild: message.guildId, owner: message.author.id, itemId, quantity,
          send: (data) => interaction.editReply(data), edit: (data) => interaction.editReply(data) });
        return;
      }
      if (![`${prefix}:previous`, `${prefix}:next`].includes(interaction.customId)) return;
      await interaction.deferUpdate();
      edits = edits.then(async () => {
        // A selected menu must not be reopened by a queued pagination click.
        if (collector.ended) return;
        page = Math.max(0, Math.min(pages - 1, page + (interaction.customId === `${prefix}:next` ? 1 : -1)));
        await reply.edit(view());
      }).catch(console.error);
    } catch (error) {
      console.error("Item selection failed:", error);
      await notifyError(interaction, "The selection could not complete. Run !buy again.");
    }
  });
  collector.on("end", (_, reason) => {
    if (reason === "selected") return;
    void edits.then(() => reply.edit(view(true))).catch(console.error);
  });
}

export async function buyCommand(message) {
  if (!message.inGuild() || message.author.bot) return;
  let parsed;
  try { parsed = parsePurchase(message.content); }
  catch (error) { await message.reply({ content: error.message, allowedMentions: quiet }); return; }
  const matches = findItems(parsed.query);
  if (!matches.length) { await message.reply("No matching item found. Check !shop or try part of the item's name."); return; }
  if (matches.length > 1) { await matchingItems(message, matches, parsed.quantity); return; }
  try {
    await purchasePreview({ guild: message.guildId, owner: message.author.id, itemId: matches[0][0],
      quantity: parsed.quantity, send: (data) => message.reply(data) });
  } catch (error) {
    console.error("Purchase preview failed:", error);
    await message.reply({ content: "Could not open the purchase confirmation. Check your inventory before trying again.", allowedMentions: quiet }).catch(console.error);
  }
}
