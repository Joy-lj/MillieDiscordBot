import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from "discord.js";
import { previewCrafting, confirmCrafting, CraftingError } from "../database/crafting.js";
import { craftingConfig } from "../config/crafting.js";
import { ITEMS } from "../config/items.js";
import { economyConfig } from "../config/economy.js";

const quiet = { parse: [], repliedUser: false };
const clean = value => String(value ?? "").replace(/[`*_~|<>]/g, "");
const money = amount => `${amount.toLocaleString("en-US")} ${economyConfig.currencyName}`;
const serialFrom = text => /^\d+$/.test(text ?? "") && Number.isSafeInteger(Number(text)) && Number(text) > 0 ? Number(text) : null;

async function showPreview(message, selection) {
  let plan;
  try { plan = await previewCrafting(message.guildId, message.author.id, selection); }
  catch (error) {
    console.error("Crafting preview failed:", error);
    return message.reply({ content: error instanceof CraftingError ? error.message : "Couldn't load the preview. Check the bot log.", allowedMentions: quiet });
  }
  const confirmId = `forge:${message.id}:confirm`, cancelId = `forge:${message.id}:cancel`;
  const embed = new EmbedBuilder().setColor(0xb68ade)
    .setTitle(selection.kind === "craft" ? "🔨 Confirm Crafting" : "♻️ Confirm Salvage")
    .setDescription("**Consumes permanently:**\n" + plan.consumed.map(item => `• ${clean(item.name)} #${item.serialNumber}`).join("\n") +
      "\n\n**You receive:**\n" + plan.outputs.map(item => `• ${item.quantity} × ${clean(item.name)}`).join("\n") +
      (plan.fee ? `\n\nFee: **${money(plan.fee)}**` : "") +
      "\n\nConfirm within 60 seconds. Locked and equipped copies are protected.");
  const prompt = await message.reply({
    embeds: [embed], allowedMentions: quiet, components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(confirmId).setLabel("Confirm").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(cancelId).setLabel("Cancel").setStyle(ButtonStyle.Secondary),
    )]
  });
  let click;
  try {
    click = await prompt.awaitMessageComponent({
      time: 60_000, filter: async interaction => {
        if (![confirmId, cancelId].includes(interaction.customId)) return false;
        if (interaction.user.id === message.author.id) return true;
        await interaction.reply({ content: "This confirmation belongs to another player.", flags: MessageFlags.Ephemeral }).catch(console.error);
        return false;
      }
    });
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
    .setTitle(receipt.kind === "craft" ? "✨ Crafting Complete" : "♻️ Salvage Complete")
    .setDescription(receipt.outputs.map(item => `Received **${item.quantity} × ${clean(item.name)}**.`).join("\n") +
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
        (recipe.fee ? `\nFee: ${money(recipe.fee)}` : "") + `\n\`!craft ${id} [base-serial]\``
      ).join("\n\n") || "No recipes configured.")
      .setFooter({ text: "Crafting consumes ingredients • Unequip and unlock copies first" });
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
