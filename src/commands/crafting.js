import { supplyStatus, prepareSupply } from "../database/preparation.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from "discord.js";
import { previewCrafting, confirmCrafting, CraftingError } from "../database/crafting.js";
import { craftingConfig } from "../config/crafting.js";
import { ITEMS } from "../config/items.js";
import { economyConfig } from "../config/economy.js";

const quiet = { parse: [], repliedUser: false };
const clean = value => String(value ?? "").replace(/[`*_~|<>]/g, "");
const money = amount => `${amount.toLocaleString("en-US")} ${economyConfig.currencyName}`;
const serialFrom = text => /^\d+$/.test(text ?? "") && Number.isSafeInteger(Number(text)) && Number(text) > 0 ? Number(text) : null;

function consumedLines(plan) {
  const groups = new Map();
  for (const item of plan.consumed) {
    if (["material", "consumable"].includes(ITEMS[item.itemId]?.type)) {
      const group = groups.get(item.itemId) ?? { name: item.name, count: 0 };
      group.count++;groups.set(item.itemId, group);
    } else groups.set(`copy:${item.id}`, { name: `${item.name} #${item.serialNumber}`, count: 1 });
  }
  return [...groups.values()].map(item => `• ${item.count} × ${clean(item.name)}`).join("\n");
}

async function showPreview(message, selection) {
  let plan;
  try { plan = await previewCrafting(message.guildId, message.author.id, selection); }
  catch (error) {
    console.error("Crafting preview failed:", error);
    return message.reply({ content: error instanceof CraftingError ? error.message : "Couldn't load the preview. Check the bot log.", allowedMentions: quiet });
  }
  const confirmId = `forge:${message.id}:confirm`, cancelId = `forge:${message.id}:cancel`;
  const ready = plan.ready !== false;
  const requirements = plan.requirements?.length
    ? plan.requirements.map(item => `${item.available >= item.required ? "✅" : "❌"} **${clean(item.name)}:** ${item.available.toLocaleString("en-US")} / ${item.required.toLocaleString("en-US")}${item.missing ? ` — need ${item.missing} more` : ""}`).join("\n")
    : consumedLines(plan);
  const embed = new EmbedBuilder().setColor(ready ? 0xb68ade : 0xe0a338)
    .setTitle(selection.kind === "craft" ? "🔨 Crafting Requirements" : selection.kind === "upgrade" ? "🔧 Reinforcement Requirements" : "♻️ Confirm Salvage")
    .setDescription("**Materials required (available / required):**\n" + requirements +
      (plan.fee ? `\n${(plan.balance ?? plan.fee) >= plan.fee ? "✅" : "❌"} **Currency:** ${money(plan.balance ?? plan.fee)} / ${money(plan.fee)}` : "") +
      (plan.upgrade ? `\n\n**${clean(plan.name)} #${plan.upgrade.serialNumber}**\n${plan.upgrade.key.toUpperCase()}: **${plan.upgrade.before} → ${plan.upgrade.after}**` : "\n\n**You receive:**\n" + plan.outputs.map(item => `• ${item.quantity} × ${clean(item.name)}`).join("\n")) +
      (ready ? "\n\nConfirm within 60 seconds. Required ingredients are consumed permanently. Locked and equipped copies are protected." : "\n\nSome requirements are missing. Nothing was consumed. Gather the missing materials/currency, then run the command again.") +
      "\nOnly unlocked, unequipped copies count as available.");
  if (!ready) return message.reply({ embeds: [embed], allowedMentions: quiet });
  const prompt = await message.reply({ embeds: [embed], allowedMentions: quiet, components: [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(confirmId).setLabel("Confirm").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(cancelId).setLabel("Cancel").setStyle(ButtonStyle.Secondary),
  )] });
  let click;
  try {
    click = await prompt.awaitMessageComponent({ time: 60_000, filter: async interaction => {
      if (![confirmId, cancelId].includes(interaction.customId)) return false;
      if (interaction.user.id === message.author.id) return true;
      await interaction.reply({ content: "This confirmation belongs to another player.", flags: MessageFlags.Ephemeral }).catch(console.error);
      return false;
    } });
  } catch (error) {
    if (error.code !== "InteractionCollectorError") console.error("Crafting confirmation ended:", error);
    await prompt.edit({ content: "Confirmation expired. No crafting or salvage was performed.", embeds: [], components: [], allowedMentions: quiet }).catch(console.error);
    return;
  }
  // Failed acknowledgement prevents execution; awaitMessageComponent accepts one click.
  await click.deferUpdate();
  if (click.customId === cancelId) {
    await prompt.edit({ content: "Canceled. Your items were kept.", embeds: [], components: [], allowedMentions: quiet }).catch(console.error);
    return;
  }
  let receipt;
  try { receipt = await confirmCrafting(message.guildId, message.author.id, message.id, selection, plan.quote); }
  catch (error) {
    console.error("Crafting action failed:", error);
    await prompt.edit({ content: error instanceof CraftingError ? error.message : "Couldn't confirm the action. Check !inventory before trying again.", embeds: [], components: [], allowedMentions: quiet }).catch(console.error);
    return;
  }
  const result = new EmbedBuilder().setColor(0x39c995)
    .setTitle(receipt.kind === "craft" ? "✨ Crafting Complete" : receipt.kind === "upgrade" ? "🔧 Reinforcement Complete" : "♻️ Salvage Complete")
    .setDescription((receipt.updatedItem ? `Reinforced **${clean(receipt.updatedItem.name)} #${receipt.updatedItem.serialNumber}**.\n${receipt.updatedItem.key.toUpperCase()}: **${receipt.updatedItem.before} → ${receipt.updatedItem.after}**` : receipt.outputs.map(item => `Received **${item.quantity} × ${clean(item.name)}**.`).join("\n")) +
      (receipt.kind === "craft" ? `\nSerial: **#${receipt.addedItems[0].serialNumber}**` : "") +
      "\nUse `!inventory` to view your items.");
  await prompt.edit({ content: null, embeds: [result], components: [], allowedMentions: quiet })
    .catch(error => console.error("Crafting committed but receipt failed:", error));
}

export async function craftCommand(message) {
  if (!message.inGuild() || message.author.bot) return;
  const args = message.content.trim().split(/\s+/);
  if (args.length === 1) {
    const embed = new EmbedBuilder().setColor(0xb68ade).setTitle("🔨 Millie's Crafting Recipes")
      .setDescription(Object.entries(craftingConfig.recipes).map(([id, recipe]) =>
        `**${clean(recipe.name)}**\n` + recipe.ingredients.map(ingredient =>
          `${ingredient.quantity} × ${clean(ITEMS[ingredient.itemId]?.name ?? ingredient.itemId)}`).join(" + ") +
        (recipe.fee ? `\nFee: ${money(recipe.fee)}` : "") + `\n\`!craft ${id}${recipe.baseItemId ? " [base-serial]" : ""}\``
      ).join("\n\n") || "No recipes configured.")
      .setFooter({ text: "Crafting consumes ingredients • Use !prepare for supplies • Unequip/unlock gear first" });
    return message.reply({ embeds: [embed], allowedMentions: quiet });
  }
  const serialNumber = args[2] == null ? null : serialFrom(args[2]);
  if (args.length > 3 || (args[2] != null && serialNumber == null)) {
    return message.reply({ content: "Usage: `!craft <recipe-id> [base-serial]`. Example: `!craft millies-eternal-wrath 1`.", allowedMentions: quiet });
  }
  return showPreview(message, { kind: "craft", itemId: args[1].toLowerCase(), serialNumber });
}

export async function salvageCommand(message) {
  if (!message.inGuild() || message.author.bot) return;
  const args = message.content.trim().split(/\s+/);
  const serialNumber = serialFrom(args[2]);
  if (args.length !== 3 || serialNumber == null) {
    return message.reply({ content: "Usage: `!salvage <item-id> <serial-number>`. Example: `!salvage feather 1`. Preview the materials before confirming.", allowedMentions: quiet });
  }
  return showPreview(message, { kind: "salvage", itemId: args[1].toLowerCase(), serialNumber });
}


export async function upgradeCommand(message) {
  if (!message.inGuild() || message.author.bot) return;
  const args = message.content.trim().split(/\s+/);
  const serialNumber = serialFrom(args[2]);
  if (args.length !== 3 || serialNumber == null) return message.reply({
    content: "Usage: `!upgrade <item-id> <serial-number>`. Example: `!upgrade millies-wrath 1`. Maximum +3; preview before paying.", allowedMentions: quiet,
  });
  return showPreview(message, { kind: "upgrade", itemId: args[1].toLowerCase(), serialNumber });
}

function supplyRequirements(item, balance) {
  return `**${clean(item.name)}** — ${item.available} unlocked supplies\n${clean(item.description)}\n` +
    "**To craft one:**\n" + item.requirements.map(row =>
      `${row.available >= row.required ? "✅" : "❌"} ${clean(row.name)}: **${row.available} / ${row.required}**`
    ).join("\n") +
    `\n${balance >= item.fee ? "✅" : "❌"} Currency: **${money(balance)} / ${money(item.fee)}**\n` +
    `\`!craft ${item.id}\` → \`!prepare ${item.id}\``;
}

export async function prepareCommand(message) {
  if (!message.inGuild() || message.author.bot) return;
  const args = message.content.trim().split(/\s+/);
  if (args.length > 2) return message.reply({ content: "Usage: `!prepare [supply-id|clear]`.", allowedMentions: quiet });
  let data, notice = "";
  try {
    if (args[1]) {
      const result = await prepareSupply(message.guildId, message.author.id, args[1].toLowerCase());
      if (result.success) return message.reply({ content: result.message, allowedMentions: quiet });
      notice = result.message + "\n\n";
    }
    data = await supplyStatus(message.guildId, message.author.id);
  } catch (error) {
    console.error("Supply preparation failed:", error);
    return message.reply({ content: "Couldn't load or confirm preparation. Use !prepare to check the selected supply.", allowedMentions: quiet });
  }
  const embed = new EmbedBuilder().setColor(0x39c995).setTitle("🎒 Prepare a Dungeon Supply")
    .setDescription(notice + `Prepared: **${clean(data.prepared ? ITEMS[data.prepared]?.name ?? data.prepared : "None")}**\n\n` +
      data.supplies.map(item => supplyRequirements(item, data.balance)).join("\n\n") +
      "\n\nPreparing an OWNED supply is free; materials/currency above are its crafting cost. Crafting is a separate action. One supply per run, consumed at entry/acceptance. Only unlocked copies count. Use `!prepare clear` to cancel.");
  await message.reply({ embeds: [embed], allowedMentions: quiet });
}
