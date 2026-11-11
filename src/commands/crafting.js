import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, MessageFlags, StringSelectMenuBuilder,
} from "discord.js";
import {
  getCraftingInventory, previewCrafting, confirmCrafting, CraftingError, MAX_CRAFT_BATCH,
} from "../database/crafting.js";
import { supplyStatus, prepareSupply } from "../database/preparation.js";
import { craftingConfig } from "../config/crafting.js";
import { ITEMS } from "../config/items.js";
import { economyConfig } from "../config/economy.js";
import { applyItemUpgrade } from "../../services/itemUpgrades.js";
import { itemIcon } from "../../services/equipmentArtwork.js";
import {
  CRAFT_CATEGORIES, recipeCategory, browserEntries, copiesFor, affordableBatch, pageBounds,
} from "../../services/craftingBrowserLogic.js";

const quiet = { parse: [], repliedUser: false };
const clean = (value, max = 500) => String(value ?? "").replace(/[`*_~|<>]/g, "").slice(0, max);
const money = n => `${Number(n).toLocaleString("en-US")} ${economyConfig.currencyName}`;
const row = (...components) => new ActionRowBuilder().addComponents(...components);
const positive = text => /^\d+$/.test(text ?? "") && Number.isSafeInteger(Number(text)) && Number(text) > 0 ? Number(text) : null;
const protectedCopy = copy => copy?.is_locked || copy?.is_equipped;
const statText = item => {
  const s = item?.stats ?? {};
  return `⚔️ ${s.attack ?? 0} ATK • 🛡️ ${s.defense ?? 0} DEF • ❤️ ${s.health ?? 0} HP\n` +
    `💨 ${s.speed ?? 0} SPD • 🎯 ${Number(((s.critChance ?? 0) * 100).toFixed(1))}% CRIT`;
};

function requirementText(plan) {
  const ingredients = plan.requirements.map(r =>
    `${r.available >= r.required ? "✅" : "❌"} **${clean(r.name, 65)}:** ${r.available.toLocaleString("en-US")} / ${r.required.toLocaleString("en-US")}`
  ).join("\n");
  return (ingredients || "No additional materials.") +
    `\n${plan.balance >= plan.fee ? "✅" : "❌"} **Currency:** ${money(plan.balance)} / ${money(plan.fee)}`;
}

function addRequirements(embed, plan) {
  let chunk = "", part = 0;
  for (const line of requirementText(plan).split("\n")) {
    if ((chunk + "\n" + line).length > 1024) {
      embed.addFields({ name: part++ ? "Requirements (continued)" : "Requirements — available / required", value: chunk });
      chunk = "";
    }
    chunk += (chunk ? "\n" : "") + line;
  }
  if (chunk) embed.addFields({ name: part ? "Requirements (continued)" : "Requirements — available / required", value: chunk });
}

function consumedText(consumed) {
  const grouped = new Map();
  for (const copy of consumed) {
    const equipment = ["weapon", "armor", "accessory"].includes(ITEMS[copy.itemId]?.type);
    const key = equipment ? `copy:${copy.id}` : copy.itemId;
    const entry = grouped.get(key) ?? { name: `${copy.name}${equipment ? ` #${copy.serialNumber}` : ""}`, count: 0 };
    entry.count++; grouped.set(key, entry);
  }
  return [...grouped.values()].map(r => `• ${r.count} × ${clean(r.name, 85)}`).join("\n");
}

function normalize(state) {
  state.entries = browserEntries(state.category, craftingConfig.recipes, ITEMS, state.snapshot.rows);
  let index = state.entries.findIndex(e => e.id === state.entryId);
  if (index < 0) {
    const bounds = pageBounds(state.entryPage, state.entries.length);
    index = bounds.page * 25;
    state.entryId = state.entries[index]?.id ?? null;
  }
  state.entryPage = Math.floor(Math.max(index, 0) / 25);
  state.entry = state.entries[index] ?? null;
  const baseId = state.entry?.recipe?.baseItemId ?? (["upgrade", "salvage"].includes(state.category) ? state.entry?.itemId : null);
  state.copies = baseId ? copiesFor(state.snapshot.rows, baseId) : [];
  state.copy = state.copies.find(c => String(c.id) === state.copyId) ?? state.copies[0] ?? null;
  state.copyId = state.copy ? String(state.copy.id) : null;
  state.copyPage = Math.floor(Math.max(0, state.copies.findIndex(c => String(c.id) === state.copyId)) / 25);
  if (state.category !== "supplies") state.quantity = 1;
}

function selectionForState(state) {
  if (!state.entry) return null;
  if (["upgrade", "salvage"].includes(state.category)) {
    if (!state.copy) return null;
    return { kind: state.category, itemId: state.entry.itemId, serialNumber: state.copy.serial_number };
  }
  return { kind: "craft", itemId: state.entry.id,
    serialNumber: state.entry.recipe.baseItemId ? state.copy?.serial_number ?? null : null,
    quantity: state.quantity };
}

async function refreshState(state) {
  state.snapshot = await getCraftingInventory(state.guild, state.owner);
  normalize(state);
  state.plan = null; state.error = "";
  const selection = selectionForState(state);
  if (selection) {
    try { state.plan = await previewCrafting(state.guild, state.owner, selection); }
    catch (error) {
      if (!(error instanceof CraftingError)) throw error;
      state.error = error.message;
    }
  }
}

function buildControls(state) {
  const id = action => `${state.prefix}:${state.revision}:${action}`;
  const button = (action, label, disabled = false, style = ButtonStyle.Secondary) => new ButtonBuilder()
    .setCustomId(id(action)).setLabel(label).setStyle(style).setDisabled(disabled);
  if (state.mode === "confirm") return [row(
    button("confirm", "Confirm — consume ingredients", false, ButtonStyle.Danger), button("cancel", "Cancel")
  )];
  if (state.mode === "uncertain") return [row(
    button("retry", "Retry same action", false, ButtonStyle.Primary), button("back", "Back to browser")
  )];
  if (state.mode === "receipt") return [row(
    button("back", "Back to browser", false, ButtonStyle.Primary),
    ...((state.receipt.outputs ?? []).some(o => ITEMS[o.itemId]?.type === "consumable") ? [button("prepare", "Prepare this supply", false, ButtonStyle.Success)] : [])
  )];

  const components = [row(new StringSelectMenuBuilder().setCustomId(id("category"))
    .setPlaceholder("Choose a crafting category").addOptions(Object.entries(CRAFT_CATEGORIES).map(([value, label]) =>
      ({ value, label, default: value === state.category }))))];
  if (state.entries.length) components.push(row(new StringSelectMenuBuilder().setCustomId(id("item"))
    .setPlaceholder(["upgrade", "salvage"].includes(state.category) ? "Choose owned equipment" : "Choose a recipe")
    .addOptions(state.entries.slice(state.entryPage * 25, state.entryPage * 25 + 25).map(e => ({
      value: e.id, label: clean(e.name, 100), default: e.id === state.entryId,
    })))));
  if (state.copies.length) components.push(row(new StringSelectMenuBuilder().setCustomId(id("copy"))
    .setPlaceholder("Choose the exact gear copy")
    .addOptions(state.copies.slice(state.copyPage * 25, state.copyPage * 25 + 25).map(c => ({
      value: String(c.id), label: `#${c.serial_number} • +${c.upgrade_level}${c.is_equipped ? " • Equipped" : ""}${c.is_locked ? " • Locked" : ""}`,
      default: String(c.id) === state.copyId,
    })))));
  else if (state.category === "supplies" && state.entry) components.push(row(new StringSelectMenuBuilder()
    .setCustomId(id("quantity")).setPlaceholder("Batch size")
    .addOptions([...new Set([1, 5, 10, state.quantity])].sort((a, b) => a - b).map(n =>
      ({ value: String(n), label: `Craft ${n}`, default: n === state.quantity })))));

  const entryPages = pageBounds(state.entryPage, state.entries.length).pages;
  const copyPages = pageBounds(state.copyPage, state.copies.length).pages;
  components.push(row(
    button("previous", "Previous", state.entryPage === 0), button("next", "Next", state.entryPage >= entryPages - 1),
    button("copyPrevious", "Previous copies", state.copyPage === 0 || !state.copies.length),
    button("copyNext", "Next copies", state.copyPage >= copyPages - 1 || !state.copies.length),
    button("refresh", "Refresh")
  ));
  const actions = [button("review", state.category === "upgrade" ? "Review upgrade" : state.category === "salvage" ? "Review salvage" : "Review craft",
    !state.plan?.ready, state.category === "salvage" ? ButtonStyle.Danger : ButtonStyle.Success)];
  if (state.category === "supplies" && state.entry) {
    const max = affordableBatch(state.entry.recipe, state.snapshot.rows, state.snapshot.balance, MAX_CRAFT_BATCH);
    actions.push(button("max", `Max affordable (${max})`, max < 1), button("prepare", "Prepare owned supply"));
  }
  components.push(row(...actions));
  return components;
}

async function buildView(state) {
  const embed = new EmbedBuilder().setColor(0xb68ade);
  const files = [];
  let imageId = state.entry?.itemId;
  if (state.mode === "confirm") {
    const p = state.pending.plan;
    embed.setTitle("🔨 Confirm Crafting Action").setColor(0xe0a338)
      .setDescription(`**${clean(p.name, 90)}**\n\n**Permanently consumes:**\n${consumedText(p.consumed)}\n\n` +
        (p.upgrade ? `**Reinforces copy #${p.upgrade.serialNumber}:** ${p.upgrade.key.toUpperCase()} ${p.upgrade.before} → ${p.upgrade.after}` + healthChange(p.upgrade)
          : "**Creates:**\n" + p.outputs.map(o => `• ${o.quantity} × ${clean(o.name, 90)}`).join("\n")) +
        `\n\n**Fee:** ${money(p.fee)}\nConfirmation expires <t:${Math.ceil(state.pending.expiresAt / 1000)}:R>.\nCancel keeps all your items.`);
  } else if (state.mode === "uncertain") {
    embed.setTitle("⚠️ Confirmation Could Not Be Verified").setDescription(
      "Check your inventory and balance. You can retry **the same action** below; its saved request ID prevents a second charge if it already committed.\n\n" +
      "Going back starts a new preview. It does not undo an action that already completed.");
  } else if (state.mode === "receipt") {
    const r = state.receipt;
    imageId = r.updatedItem?.itemId ?? r.outputs?.[0]?.itemId;
    embed.setColor(0x39c995).setTitle("✨ Crafting Complete")
      .setDescription((r.updatedItem ? `**${clean(r.updatedItem.name, 90)} #${r.updatedItem.serialNumber}**\n${r.updatedItem.key.toUpperCase()}: **${r.updatedItem.before} → ${r.updatedItem.after}**` + healthChange(r.updatedItem)
        : r.outputs.map(o => `**${o.quantity} × ${clean(o.name, 90)}**`).join("\n")) +
        `\n\nFee paid: **${money(r.fee)}**` + (r.balance == null ? "" : `\nBalance after action: **${money(r.balance)}**`) +
        (r.addedItems.length ? `\nCopies: ${r.addedItems.slice(0, 8).map(i => `#${i.serialNumber}`).join(", ")}${r.addedItems.length > 8 ? "…" : ""}` : "") +
        "\n\nYour result is saved in `!inventory`.");
  } else {
    const entry = state.entry, plan = state.plan;
    const copyItem = state.copy ? applyItemUpgrade(ITEMS[state.copy.item_id], state.copy.upgrade_level) : null;
    const result = plan?.outputs[0];
    const item = result ? applyItemUpgrade(ITEMS[result.itemId], result.upgradeLevel) : copyItem ?? ITEMS[entry?.itemId];
    embed.setTitle(entry ? `🔨 ${clean(item?.name ?? entry.name, 90)}` : `🔨 ${CRAFT_CATEGORIES[state.category]}`)
      .setDescription((state.notice ? `${clean(state.notice)}\n\n` : "") +
        (entry ? `${clean(item?.description, 300)}\n\n` : "No eligible entries in this category. Choose another category above.\n\n") +
        (state.category === "salvage" ? "Salvaging permanently destroys the selected copy. Reinforcement costs are not refunded."
          : state.category === "upgrade" ? "Guaranteed reinforcement, one level at a time, up to +3. The same item instance and serial are kept."
          : state.category === "supplies" ? `Batch: **${state.quantity} supplies**. Materials and fees scale equally; no bulk discount.`
          : state.category === "materials" ? "Exchange Cosmic Shards for one chosen component. No equipment is consumed."
          : "Craft one attachment variant. The exact base copy is consumed and its reinforcement level carries into the result."));
    if (state.copy) embed.addFields({ name: "Selected gear copy", value:
      `**${clean(copyItem.name, 80)} #${state.copy.serial_number}**${state.copy.is_equipped ? " • Equipped" : ""}${state.copy.is_locked ? " • Locked" : ""}` });
    if (plan) {
      addRequirements(embed, plan);
      if (plan.blockers.length) embed.addFields({ name: "Before you continue", value: plan.blockers.map(b => clean(b)).join("\n") });
      if (plan.upgrade) embed.addFields({ name: "Upgrade preview", value:
        `+${plan.upgrade.from} → +${plan.upgrade.to}\n${plan.upgrade.key.toUpperCase()}: **${plan.upgrade.before} → ${plan.upgrade.after}**` + healthChange(plan.upgrade) });
      else if (state.category === "salvage") embed.addFields({ name: "You receive", value: plan.outputs.map(o => `${o.quantity} × ${clean(o.name, 80)}`).join("\n") });
      if (!plan.ready && !plan.blockers.length) embed.addFields({ name: "Missing requirements", value: "Gather the missing materials or currency, then press Refresh." });
    } else if (state.error) embed.addFields({ name: "Before you continue", value: clean(state.error, 900) });
    if (item && state.category !== "salvage" && ["weapon", "armor", "accessory"].includes(item.type)) embed.addFields({ name: "Result stats", value: statText(item) });
    const skill = item?.dungeon?.ability ?? item?.dungeon?.passive;
    if (skill) embed.addFields({ name: `✨ ${clean(skill.name, 90)}`, value: clean(skill.description, 400) || "Equipment effect" });
    embed.setFooter({ text: `Items ${state.entryPage + 1}/${pageBounds(state.entryPage, state.entries.length).pages} • Copies ${state.copyPage + 1}/${pageBounds(state.copyPage, state.copies.length).pages} • Only unlocked, unequipped ingredients count • Controls last 10 minutes` });
  }
  if (imageId) {
    try {
      const artwork = await itemIcon(imageId);
      if (artwork) { files.push(new AttachmentBuilder(artwork, { name: "craft-item.png" })); embed.setThumbnail("attachment://craft-item.png"); }
    } catch (error) { console.error("Crafting artwork unavailable:", error.message); }
  }
  return { content: null, embeds: [embed], components: buildControls(state), files, attachments: [], allowedMentions: quiet };
}

async function openBrowser(message, seed = {}) {
  const state = { guild: message.guildId, owner: message.author.id, prefix: `forge:${message.id}`,
    revision: 0, category: "supplies", entryId: null, entryPage: 0, copyId: null, copyPage: 0,
    quantity: 1, notice: "", mode: "browse", pending: null, ...seed };
  let panelMessage;
  try {
    await refreshState(state);
    if (seed.entryId && !state.entries.some(e => e.id === seed.entryId)) throw new CraftingError("You don't own an eligible copy of that item. Check !inventory.");
    if (seed.serialNumber != null) {
      const copy = state.copies.find(c => c.serial_number === seed.serialNumber);
      if (!copy) throw new CraftingError("You don't own that item and serial. Check !inventory.");
      state.copyId = String(copy.id);
      await refreshState(state);
    }
    panelMessage = await message.reply(await buildView(state));
  } catch (error) {
    console.error("Crafting browser failed:", error);
    return message.reply({ content: error instanceof CraftingError ? error.message : "Couldn't open crafting. Check the bot log.", allowedMentions: quiet }).catch(console.error);
  }
  const collector = panelMessage.createMessageComponentCollector({ time: 600_000,
    filter: i => i.customId?.startsWith(state.prefix + ":") });
  let busy = false, expired = false, pendingWork = Promise.resolve();
  const repaint = async () => { state.revision++; await panelMessage.edit(await buildView(state)); };

  async function commitPending() {
    const pending = state.pending;
    if (!pending) throw new CraftingError("Open a new review before confirming.");
    try {
      state.receipt = await confirmCrafting(state.guild, state.owner, pending.requestId, pending.selection, pending.plan.quote);
      state.mode = "receipt";
      state.pending = null;
    } catch (error) {
      console.error("Crafting confirmation failed:", error);
      if (error instanceof CraftingError) {
        state.mode = "browse"; state.pending = null;
        state.notice = error.message;
        await refreshState(state);
      } else state.mode = "uncertain";
    }
  }

  collector.on("collect", i => {
    const reject = content => { void i.reply({ content, flags: MessageFlags.Ephemeral }).catch(console.error); };
    if (i.user.id !== state.owner) return reject("These crafting controls belong to another player. Use !craft.");
    if (expired || collector.ended) return reject("Controls expired. Use !craft again.");
    if (busy) return reject("Finishing your previous action. Please wait.");
    busy = true;
    pendingWork = (async () => {
      try {
        await i.deferUpdate();
        const parts = i.customId.split(":");
        if (parts.length !== 4 || Number(parts[2]) !== state.revision) return i.followUp({ content: "The panel changed. Use its current controls.", flags: MessageFlags.Ephemeral });
        const action = parts[3], value = i.values?.[0];
        if (state.mode === "confirm" || state.mode === "uncertain") {
          if (action === "cancel" || action === "back") {
            state.mode = "browse"; state.pending = null; state.notice = ""; await refreshState(state);
          } else if (action === "confirm" && state.mode === "confirm") {
            if (Date.now() > state.pending.expiresAt) {
              state.mode = "browse"; state.pending = null; state.notice = "Confirmation expired. Open a new review."; await refreshState(state);
            } else await commitPending();
          } else if (action === "retry" && state.mode === "uncertain") await commitPending();
          else throw new CraftingError("Use the confirmation controls currently shown.");
        } else if (state.mode === "receipt") {
          if (action === "prepare") {
            const supply = state.receipt.outputs.find(o => ITEMS[o.itemId]?.type === "consumable");
            if (!supply) throw new CraftingError("No supply in this receipt.");
            const result = await prepareSupply(state.guild, state.owner, supply.itemId);
            await i.followUp({ content: result.message, flags: MessageFlags.Ephemeral });
          } else if (action === "back") { state.mode = "browse"; state.notice = ""; await refreshState(state); }
          else throw new CraftingError("Use Back to browser to start a new action.");
        } else {
          state.notice = "";
          if (action === "category") {
            if (!Object.hasOwn(CRAFT_CATEGORIES, value)) throw new CraftingError("Unknown category.");
            Object.assign(state, { category: value, entryId: null, entryPage: 0, copyId: null, quantity: 1 });
          } else if (action === "item") {
            if (!state.entries.some(e => e.id === value)) throw new CraftingError("That entry is unavailable.");
            Object.assign(state, { entryId: value, copyId: null, quantity: 1 });
          } else if (action === "copy") {
            if (!state.copies.some(c => String(c.id) === value)) throw new CraftingError("That copy is unavailable.");
            state.copyId = value;
          } else if (action === "quantity") {
            const n = positive(value);
            if (state.category !== "supplies" || !n || n > MAX_CRAFT_BATCH) throw new CraftingError("Invalid batch size.");
            state.quantity = n;
          } else if (["previous", "next"].includes(action)) {
            const page = pageBounds(state.entryPage + (action === "next" ? 1 : -1), state.entries.length).page;
            state.entryId = state.entries[page * 25]?.id ?? null; state.copyId = null;
          } else if (["copyPrevious", "copyNext"].includes(action)) {
            const page = pageBounds(state.copyPage + (action === "copyNext" ? 1 : -1), state.copies.length).page;
            state.copyId = state.copies[page * 25] ? String(state.copies[page * 25].id) : null;
          } else if (action === "max") {
            await refreshState(state);
            state.quantity = Math.max(1, affordableBatch(state.entry?.recipe, state.snapshot.rows, state.snapshot.balance, MAX_CRAFT_BATCH));
          } else if (action === "prepare") {
            if (state.category !== "supplies" || !state.entry) throw new CraftingError("Choose a supply first.");
            const result = await prepareSupply(state.guild, state.owner, state.entry.itemId);
            state.notice = result.message;
          } else if (!["refresh", "review"].includes(action)) throw new CraftingError("Unknown crafting control.");
          await refreshState(state);
          if (action === "review") {
            if (!state.plan?.ready) state.notice = "Requirements changed or are incomplete. Review the checklist below.";
            else {
              state.pending = { plan: state.plan, selection: selectionForState(state), requestId: `forge:${message.id}:${state.revision}`, expiresAt: Date.now() + 60_000 };
              state.mode = "confirm";
            }
          }
        }
        await repaint();
      } catch (error) {
        console.error("Crafting browser interaction failed:", error);
        await i.followUp({ content: error instanceof CraftingError ? error.message : "Couldn't update the panel. Check your inventory and balance before starting another action.", flags: MessageFlags.Ephemeral }).catch(console.error);
      } finally { busy = false; }
    })().catch(error => console.error("Crafting interaction acknowledgement failed:", error));
  });
  collector.on("end", () => {
    expired = true;
    void pendingWork.then(() => panelMessage.edit({ components: [] })).catch(console.error);
  });
}

export async function craftCommand(message) {
  if (!message.inGuild() || message.author.bot) return;
  const args = message.content.trim().split(/\s+/);
  if (args.length === 1) return openBrowser(message);
  const id = args[1].toLowerCase(), recipe = Object.hasOwn(craftingConfig.recipes, id) ? craftingConfig.recipes[id] : null;
  const n = args[2] == null ? null : positive(args[2]);
  if (!recipe || args.length > 3 || (args[2] != null && !n)) return message.reply("Usage: `!craft`, `!craft <supply-id> [quantity]`, or `!craft <attachment-id> [base-serial]`.");
  const category = recipeCategory(recipe, ITEMS);
  if (category === "materials" && n != null) return message.reply("Exchange one component at a time: `!craft <recipe-id>`.");
  if (category === "supplies" && n > MAX_CRAFT_BATCH) return message.reply("Craft up to 10 supplies at a time.");
  return openBrowser(message, { category, entryId: id, quantity: category === "supplies" ? n ?? 1 : 1,
    serialNumber: recipe.baseItemId ? n : null });
}

async function gearCommand(message, category) {
  if (!message.inGuild() || message.author.bot) return;
  const args = message.content.trim().split(/\s+/), id = args[1]?.toLowerCase();
  const serial = args[2] == null ? null : positive(args[2]);
  if (args.length > 3 || (args[2] != null && !serial) || (id && !Object.hasOwn(ITEMS, id))) return message.reply(`Usage: \`!${category} [item-id] [serial-number]\`.`);
  if (id && !(category === "upgrade" ? ["weapon", "armor"].includes(ITEMS[id].type)
    : ["weapon", "armor", "accessory"].includes(ITEMS[id].type) && ITEMS[id].salvageable !== false)) return message.reply("That item is not eligible for this action.");
  return openBrowser(message, { category, entryId: id ?? null, serialNumber: serial });
}
export const upgradeCommand = message => gearCommand(message, "upgrade");
export const salvageCommand = message => gearCommand(message, "salvage");

export async function prepareCommand(message) {
  if (!message.inGuild() || message.author.bot) return;
  const args = message.content.trim().split(/\s+/);
  if (args.length > 2) return message.reply("Usage: `!prepare [supply-id|clear]`.");
  try {
    let notice = "";
    if (args[1]) {
      const result = await prepareSupply(message.guildId, message.author.id, args[1].toLowerCase());
      if (result.success) return message.reply({ content: result.message, allowedMentions: quiet });
      notice = result.message + "\n\n";
    }
    const data = await supplyStatus(message.guildId, message.author.id);
    const embed = new EmbedBuilder().setColor(0x39c995).setTitle("🎒 Prepared Dungeon Supply")
      .setDescription(notice + `Prepared: **${clean(data.prepared ? ITEMS[data.prepared]?.name ?? data.prepared : "None")}**\n\n` +
        data.supplies.map(item => `**${clean(item.name)}** — ${item.available} unlocked\n${clean(item.description)}\n` +
          (item.requirements ?? []).map(r => `${r.available >= r.required ? "✅" : "❌"} ${clean(r.name, 60)}: ${r.available} / ${r.required}`).join("\n") +
          `\n${data.balance >= item.fee ? "✅" : "❌"} Currency to craft: ${money(item.fee)}\n\`!prepare ${item.id}\``).join("\n\n") +
        "\n\nPreparing an owned supply is free. Use `!craft` to browse its recipe. Only one supply is used per run. Use `!prepare clear` to remove your selection.");
    return message.reply({ embeds: [embed], allowedMentions: quiet });
  } catch (error) {
    console.error("Supply preparation failed:", error);
    return message.reply({ content: "Couldn't confirm preparation. Use !prepare to check your selected supply.", allowedMentions: quiet });
  }
}

function healthChange(change) {
  return change.healthAfter > change.healthBefore ? `\nHP: **${change.healthBefore} → ${change.healthAfter}**` : "";
}
