import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from "discord.js";
import { gathering } from "../database/gathering.js";
import { gatheringConfig } from "../config/gathering.js";
import { ITEMS } from "../config/items.js";
import { activityFor, GatheringError } from "../../services/gatheringLogic.js";

const quiet = { parse: [], repliedUser: false };
const clean = value => String(value ?? "").replace(/[`*_~|<>]/g, "");
const aliases = { mine: "mine", scavenge: "scavenge", scavange: "scavenge", hunt: "hunt" };
const percentage = n => `${Number((n / 100).toFixed(2))}%`;
const timestamp = ms => Math.ceil(ms / 1000);
const cid = (owner, activity, action) => `gather:${owner}:${activity}:${action}`;

function controls(owner, activity = "mine") {
  const button = (id, label, action, style = ButtonStyle.Primary) => new ButtonBuilder()
    .setCustomId(cid(owner, id, action)).setLabel(label).setStyle(style);
  return [new ActionRowBuilder().addComponents(
    button("mine", "⛏️ Mine", "collect"),
    button("scavenge", "🔎 Scavenge", "collect"),
    button("hunt", "🏹 Hunt", "collect"),
    button(activity, "Drop odds", "odds", ButtonStyle.Secondary),
    button(activity, "Cooldowns", "status", ButtonStyle.Secondary),
  )];
}

const panel = (embed, owner, activity) => ({ content: null, embeds: [embed], components: controls(owner, activity), allowedMentions: quiet });

function resultView(result, owner) {
  const entry = gatheringConfig.activities[result.activity];
  const embed = new EmbedBuilder().setColor(entry.color);
  if (!result.success) {
    embed.setTitle(`${entry.emoji} ${entry.name} — Resting`)
      .setDescription(`You can try again <t:${timestamp(result.nextGatherAt)}:R>.\n\nEach activity has its own saved cooldown. You can try another activity below.`);
  } else {
    const bonus = result.drops.find(drop => drop.bonus);
    embed.setTitle(`${entry.emoji} ${entry.name} Complete`)
      .setColor(bonus ? 0xefc15a : entry.color)
      .setDescription(result.drops.map(drop =>
        `${drop.bonus ? "✨ **RARE FIND!** " : "📦 "}**${drop.quantity} × ${clean(drop.name)}**`
      ).join("\n") + `\n\nAdded to your materials in \`!inventory\`.\nNext trip: <t:${timestamp(result.nextGatherAt)}:R>.`)
      .setFooter({ text: "Use !craft and !upgrade to spend materials • Buttons update this panel" });
  }
  return panel(embed, owner, result.activity);
}

function oddsView(owner, activity) {
  const entry = activityFor(gatheringConfig, ITEMS, activity);
  const rareWeight = entry.rare.reduce((n, drop) => n + drop.bps, 0);
  const embed = new EmbedBuilder().setColor(entry.color).setTitle(`${entry.emoji} ${entry.name} — Drop Table`)
    .setDescription(`${entry.description}\n\n**Cooldown:** ${entry.cooldownMs / 60_000} minutes, separate from the other activities.\n\n` +
      "**Basic roll — always gives materials:**\n" + entry.basic.map(drop =>
        `• ${clean(ITEMS[drop.itemId].name)} × ${drop.min}–${drop.max}: **${percentage(drop.weight)}**`
      ).join("\n") + "\n\n**Extra rare roll — one component at most:**\n" + entry.rare.map(drop =>
        `• ${clean(ITEMS[drop.itemId].name)} × 1: **${percentage(drop.bps)}**`
      ).join("\n") + `\n• No extra component: **${percentage(10_000 - rareWeight)}**\n\n` +
      "Both rolls happen on each successful trip. Rare odds are per trip, independent of previous results; there is no guaranteed drop after a certain number of attempts.");
  return panel(embed, owner, activity);
}

async function statusView(guild, owner, activity = "mine") {
  const status = await gathering.status(guild, owner);
  const embed = new EmbedBuilder().setColor(0x63acff).setTitle("🐾 Millie's Material Gathering")
    .setDescription(status.map(row => `${row.emoji} **${row.name}:** ${row.ready ? "✅ Ready" : `<t:${timestamp(row.nextGatherAt)}:R>`}`).join("\n") +
      "\n\nGather basic crafting materials and roll for rare attachment components.\n`!mine` • `!scavenge` / `!scavange` • `!hunt`\n\nUse `!mine drops`, `!scavenge drops`, or `!hunt drops` to see exact odds. No entry cost or equipment is required.");
  return panel(embed, owner, activity);
}

async function runCommand(message, activity) {
  if (!message.inGuild() || message.author.bot) return;
  const args = message.content.trim().split(/\s+/);
  if (args.length > 2 || (args[1] && !["drops", "odds", "status"].includes(args[1].toLowerCase()))) {
    return message.reply({ content: `Usage: \`!${activity}\` or \`!${activity} drops\`.`, allowedMentions: quiet });
  }
  let data;
  try {
    const action = args[1]?.toLowerCase();
    if (action === "drops" || action === "odds") data = oddsView(message.author.id, activity);
    else if (action === "status") data = await statusView(message.guildId, message.author.id, activity);
    else data = resultView(await gathering.gather(message.guildId, message.author.id, activity, message.id), message.author.id);
  } catch (error) {
    console.error("Gathering command failed:", error);
    data = { content: error instanceof GatheringError ? error.message : "Couldn't confirm your gathering trip. Check !inventory before retrying.", allowedMentions: quiet };
  }
  // A Discord send failure must never repeat the database mutation.
  await message.reply(data).catch(error => console.error("Gathering reply failed:", error));
}

export const mineCommand = message => runCommand(message, "mine");
export const scavengeCommand = message => runCommand(message, "scavenge");
export const huntCommand = message => runCommand(message, "hunt");

export async function gatheringCommand(message) {
  if (!message.inGuild() || message.author.bot) return;
  const command = message.content.trim().split(/\s+/)[0].replace(/^!/, "").toLowerCase();
  if (Object.hasOwn(aliases, command)) return runCommand(message, aliases[command]);
  if (command !== "gathering") return;
  let data;
  try { data = await statusView(message.guildId, message.author.id); }
  catch (error) {
    console.error("Gathering status failed:", error);
    data = { content: "Couldn't load gathering cooldowns. Check the bot log.", allowedMentions: quiet };
  }
  await message.reply(data).catch(console.error);
}

export async function handleGatheringInteraction(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith("gather:")) return false;
  const parts = interaction.customId.split(":");
  const [, owner, activity, action] = parts;
  if (!interaction.inGuild() || interaction.user.id !== owner) {
    await interaction.reply({ content: "These controls belong to another player. Use !gathering to open your own panel.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (parts.length !== 4 || !Object.hasOwn(gatheringConfig.activities, activity) || !["collect", "odds", "status"].includes(action)) {
    await interaction.reply({ content: "Use !gathering to get new controls.", flags: MessageFlags.Ephemeral });
    return true;
  }
  await interaction.deferUpdate();
  let data;
  try {
    if (action === "collect") data = resultView(await gathering.gather(interaction.guildId, owner, activity, interaction.id), owner);
    else if (action === "odds") data = oddsView(owner, activity);
    else data = await statusView(interaction.guildId, owner, activity);
  } catch (error) {
    console.error("Gathering interaction failed:", error);
    data = { content: error instanceof GatheringError ? error.message : "Couldn't confirm this trip. Check !inventory before retrying.", embeds: [], components: controls(owner, activity), allowedMentions: quiet };
  }
  await interaction.editReply(data).catch(error => console.error("Gathering panel update failed:", error));
  return true;
}
