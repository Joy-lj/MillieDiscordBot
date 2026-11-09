import { EmbedBuilder } from "discord.js";
import { getQuests, claimQuest } from "../database/quests.js";
import { economyConfig } from "../config/economy.js";

const quiet = { parse: [], repliedUser: false };
const money = amount => `${amount.toLocaleString("en-US")} ${economyConfig.currencyName}`;
const safe = text => String(text).replace(/[`*_~|<>]/g, "");
const actions = { work: "work shifts", fish: "fish caught", dungeon: "dungeon clears" };

function questText(quest) {
  const status = quest.claimed ? "✅ Claimed" : quest.complete ? "🎁 Ready to claim" : "⏳ In progress";
  return `**${safe(quest.name)}** — ${status}\n` +
    `${quest.progress}/${quest.target} ${actions[quest.metric]} • **${money(quest.reward)}**\n` +
    `ID: \`${quest.id}\``;
}

function questFields(data) {
  const fields = [];
  for (const period of ["daily", "weekly"]) {
    const quests = data.quests.filter(quest => quest.period === period);
    const pages = Math.max(1, Math.ceil(quests.length / 3));
    for (let page = 0; page < pages; page++) {
      fields.push({
        name: (period === "daily" ? "☀️ Daily Quests" : "📅 Weekly Quests") + (page ? " (continued)" : ""),
        value: (quests.slice(page * 3, page * 3 + 3).map(questText).join("\n\n") || "No quests configured.") +
          (page === pages - 1 ? `\n\nResets <t:${Math.floor(data.periods[period].end / 1000)}:R>.` : ""),
        inline: false,
      });
    }
  }
  return fields;
}

export async function questsCommand(message) {
  if (!message.inGuild() || message.author.bot) return;
  let data;
  try { data = await getQuests(message.guildId, message.author.id); }
  catch (error) {
    console.error("Quest board failed:", error);
    return message.reply({ content: "Couldn't load your quests. Check the bot log.", allowedMentions: quiet });
  }
  const embed = new EmbedBuilder().setColor(0x39c995)
    .setTitle(`📜 ${safe(message.author.username)}'s Quests`)
    .setDescription("Complete activities to earn bonus currency!\n" +
      "Claim one: `!claimquest daily-fish`\nClaim every ready reward: `!claimquest all`")
    .addFields(...questFields(data))
    .setFooter({ text: `Resets at midnight • ${data.timeZone} • Weekly: Monday • Use !quests to refresh` });
  await message.reply({ embeds: [embed], allowedMentions: quiet });
}

export async function claimQuestCommand(message) {
  if (!message.inGuild() || message.author.bot) return;
  const args = message.content.trim().split(/\s+/);
  if (args.length !== 2) {
    return message.reply({ content: "Usage: `!claimquest <quest-id>` or `!claimquest all`. Find IDs with `!quests`.", allowedMentions: quiet });
  }
  let result;
  try { result = await claimQuest(message.guildId, message.author.id, args[1].toLowerCase()); }
  catch (error) {
    console.error("Quest claim failed:", error);
    return message.reply({ content: "Couldn't confirm the claim. Check !quests and your balance before trying again.", allowedMentions: quiet });
  }
  if (!result.success) {
    const errors = {
      unknown_quest: "Unknown quest ID. Check `!quests` for the available IDs.",
      already_claimed: "You already claimed that quest for this period.",
      incomplete: result.quest ? `That quest isn't finished: **${result.quest.progress}/${result.quest.target}** ${actions[result.quest.metric]}.` : "That quest isn't finished.",
      nothing_ready: "No completed, unclaimed quests yet. Check `!quests`.",
      balance_limit: "The reward would exceed your balance limit. It remains unclaimed.",
    };
    return message.reply({ content: errors[result.reason] ?? "Could not claim that quest.", allowedMentions: quiet });
  }
  const embed = new EmbedBuilder().setColor(0xf1c40f).setTitle("🎁 Quest Rewards Claimed")
    .setDescription(result.quests.map(quest => `✅ ${safe(quest.name)} — **${money(quest.reward)}**`).join("\n") +
      `\n\nReceived: **${money(result.reward)}**\n${economyConfig.currencyEmoji ?? "💰"} Balance: **${money(result.balance)}**`);
  // Currency has committed. A failed receipt must never repeat the payout.
  await message.reply({ embeds: [embed], allowedMentions: quiet })
    .catch(error => console.error("Quest claimed but receipt failed:", error));
}
