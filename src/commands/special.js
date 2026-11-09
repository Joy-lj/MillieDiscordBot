import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags,
} from "discord.js";
import { ITEMS } from "../config/items.js";

const quiet = { parse: [], repliedUser: false };
const PAGE_SIZE = 4;
const clean = (value, max = 700) => String(value ?? "")
  .replace(/[`*_~|<>]/g, "").slice(0, max);
const normalize = value => String(value ?? "").toLowerCase()
  .replace(/[’']/g, "").replace(/[-_\s]+/g, " ").trim();

function weapons() {
  return Object.entries(ITEMS)
    .filter(([, item]) => item.type === "weapon" && item.slot === "main_hand" && item.dungeon?.ability)
    .map(([id, item]) => ({ id, item, skill: item.dungeon.ability }))
    .sort((a, b) => Number(a.item.stats?.attack ?? a.item.stat ?? 0) - Number(b.item.stats?.attack ?? b.item.stat ?? 0)
      || a.item.name.localeCompare(b.item.name));
}

export async function specialCommand(message) {
  if (!message.inGuild() || message.author.bot) return;

  const query = normalize(message.content.trim().split(/\s+/).slice(1).join(" "));
  const all = weapons();
  const exact = query ? all.find(entry => normalize(entry.id) === query || normalize(entry.item.name) === query) : null;
  const matches = exact ? [exact] : all.filter(entry => !query ||
    normalize(entry.id).includes(query) || normalize(entry.item.name).includes(query) || normalize(entry.skill.name).includes(query));

  if (!matches.length) {
    return message.reply({
      content: query ? "No matching weapon skills. Use `!special` to browse all, or `!special millies-wrath`." : "No main-hand weapon skills are configured yet.",
      allowedMentions: quiet,
    });
  }

  let page = 0;
  const pages = Math.ceil(matches.length / PAGE_SIZE);
  const previousId = `special:${message.id}:previous`;
  const nextId = `special:${message.id}:next`;

  const embedFor = () => {
    const embed = new EmbedBuilder().setColor(0x9775fa)
      .setTitle("⚔️ Millie's Weapon Specials")
      .setDescription(
        "Browse weapon special attacks, ordered by base attack.\n" +
        "Search by weapon or skill: `!special katana`, `!special wrath`.\n" +
        "Cooldown **1** means one full round between uses: cast on round 1, ready on round 3."
      );
    for (const entry of matches.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) {
      const { item, skill, id } = entry;
      const cooldown = Number.isSafeInteger(skill.cooldownTurns) && skill.cooldownTurns >= 0
        ? `${skill.cooldownTurns} round${skill.cooldownTurns === 1 ? "" : "s"}` : "Not specified";
      const source = item.source === "dungeon" ? "Dungeon drop" : item.source === "crafting" ? "Crafted" : item.purchasable === false ? "Special item" : "Shop";
      embed.addFields({
        name: `${clean(item.name, 80)} — ${clean(skill.name, 80)}`,
        value: `${clean(skill.description || "No skill description available.")}\n\n` +
          `⏱️ Cooldown: **${cooldown}** • ${item.handedness === 2 ? "Two-handed" : "One-handed"} • ${source}\n` +
          `Weapon ID: \`${id}\``,
        inline: false,
      });
    }
    return embed.setFooter({ text: `Page ${page + 1}/${pages} • ${matches.length} weapon skills • Current catalog; existing runs keep saved skills` });
  };

  const controls = (expired = false) => [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(previousId).setLabel("Previous").setStyle(ButtonStyle.Secondary).setDisabled(expired || page === 0),
    new ButtonBuilder().setCustomId(nextId).setLabel("Next").setStyle(ButtonStyle.Primary).setDisabled(expired || page === pages - 1),
  )];

  const reply = await message.reply({
    embeds: [embedFor()], components: pages > 1 ? controls() : [], allowedMentions: quiet,
  });
  if (pages <= 1) return;

  const collector = reply.createMessageComponentCollector({
    time: 120_000,
    filter: interaction => interaction.isButton() && [previousId, nextId].includes(interaction.customId),
  });
  let updates = Promise.resolve();
  collector.on("collect", async interaction => {
    if (interaction.user.id !== message.author.id) {
      await interaction.reply({ content: "These controls belong to another player. Use !special to open your own list.", flags: MessageFlags.Ephemeral }).catch(console.error);
      return;
    }
    // Acknowledge immediately, then serialize edits for rapid button clicks.
    const acknowledged = interaction.deferUpdate().then(() => true, error => { console.error("Special controls failed:", error); return false; });
    updates = updates.then(async () => {
      if (!await acknowledged || collector.ended) return;
      page = Math.max(0, Math.min(pages - 1, page + (interaction.customId === nextId ? 1 : -1)));
      await reply.edit({ embeds: [embedFor()], components: controls(), allowedMentions: quiet });
    }).catch(error => console.error("Special pagination failed:", error));
  });
  collector.on("end", () => {
    void updates.then(() => reply.edit({ components: controls(true) }))
      .catch(error => console.error("Could not disable special controls:", error));
  });
}
