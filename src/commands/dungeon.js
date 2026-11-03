import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from "discord.js";
import { dungeon } from "../database/dungeon.js";
import { dungeonConfig } from "../config/dungeon.js";
import { ITEMS } from "../database/items.js";
import { dungeonLootTables } from "../config/dungeonLoot.js";
import { snapshotLootTable } from "../../services/dungeonLootLogic.js";
import { economyConfig } from "../config/economy.js";
import { DungeonError, skills } from "../../services/dungeonLogic.js";

const quiet = { parse: [], repliedUser: false };
const money = (amount) => `${amount.toLocaleString("en-US")} ${economyConfig.currencyName}`;
const ongoing = ["invited", "active"];
const publicEdits = new Map();
const text = (value, max = 200) => String(value ?? "").slice(0, max).replace(/([\\`*_~|>])/g, "\\$1");

function button(run, action, label, style = ButtonStyle.Secondary, disabled = false) {
  return new ButtonBuilder().setCustomId(`dg:${run.id}:${run.state.round}:${action}`)
    .setLabel(label).setStyle(style).setDisabled(disabled);
}
const row = (...buttons) => new ActionRowBuilder().addComponents(buttons);
const LOOT_PER_PAGE = 6;
const percent = (weight, total) => `${Number((weight / total * 100).toFixed(4))}%`;
const lootId = (owner, source, difficulty, page, action) =>
  `dg:loot:${owner}:${source}:${difficulty}:${page}:${action}`;

// Adjusted health bar with high-contrast background blocks (░) for better visibility
function healthBar(current, max, length = 10) {
  const safeMax = Math.max(1, max);
  const clampedCurrent = Math.max(0, Math.min(current, safeMax));
  const filled = Math.round((clampedCurrent / safeMax) * length);
  const empty = length - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}] ${current}/${max} HP`;
}

function lootView(table, difficulty, owner, source = "current", page = 0) {
  const embed = new EmbedBuilder().setColor(0xf1c40f)
    .setTitle(`🎁 Dungeon Loot • ${text(difficulty, 40)}`);
  if (table == null) {
    return {
      embeds: [embed.setDescription(
        "This dungeon was entered before equipment drops were added. Its reward is currency only.\n\n" +
        "Use `!dungeon loot easy`, `!dungeon loot normal`, or `!dungeon loot hard` to browse future runs."
      )], components: [], allowedMentions: quiet
    };
  }
  const total = table.reduce((sum, entry) => sum + entry.weight, 0);
  if (!Number.isSafeInteger(total) || total < 1) throw new DungeonError("This loot table is unavailable.");
  const drops = table.filter(entry => entry.itemId !== null);
  const none = table.filter(entry => entry.itemId === null).reduce((sum, entry) => sum + entry.weight, 0);
  const pages = Math.max(1, Math.ceil(drops.length / LOOT_PER_PAGE));
  page = Math.max(0, Math.min(pages - 1, page));
  embed.setDescription(
    `**Equipment drop: ${percent(total - none, total)}** • **No item: ${percent(none, total)}**\n\n` +
    "Each player gets **one independent roll per full clear**, alongside their currency reward.\n" +
    "The percentages below are per clear. Only one item can drop per player.\n" +
    (source === "current" ? "These are the current odds for a new dungeon." : "These are the saved odds for this dungeon.")
  );
  for (const drop of drops.slice(page * LOOT_PER_PAGE, (page + 1) * LOOT_PER_PAGE)) {
    const item = Object.hasOwn(ITEMS, drop.itemId) ? ITEMS[drop.itemId] : null;
    const d = item?.dungeon ?? {};
    const values = item?.stats;
    const stats = !item ? "Item definition is currently unavailable." : values
      ? [
        `⚔️ ATK **${values.attack ?? 0}**`,
        `🛡️ DEF **${values.defense ?? 0}**`,
        `❤️ HP **+${values.health ?? 0}**`,
        `💨 SPD **${values.speed ?? 0}**`,
        `🎯 CRIT **${Number(((values.critChance ?? 0) * 100).toFixed(2))}%**`,
      ].join(" • ")
      : `${item.type === "weapon" ? "⚔️ ATK" : "🛡️ DEF"} **${item.stat ?? 0}**` +
      (d.healthBonus != null ? ` • HP **+${d.healthBonus}**` : "");
    const ability = d.ability ?? d.passive;
    embed.addFields({
      name: `${text(drop.name ?? item?.name ?? drop.itemId, 80)} • ${percent(drop.weight, total)}`,
      value: `${item ? `**${text(d.rarity ?? "Equipment", 30)}** • ${text(item.type, 20)} • ${text(item.slot ?? "Unassigned", 20)}\n` : ""}` +
        `${stats}\n` + (ability ? `${d.ability ? "Skill" : "Passive"}: **${text(ability.name, 60)}**\n` : "") +
        `ID: \`${text(drop.itemId, 90)}\``,
      inline: false,
    });
  }
  if (!drops.length) embed.addFields({ name: "Equipment", value: "No equipment is configured for this table." });
  embed.setFooter({ text: `Page ${page + 1}/${pages} • Stats reflect current gear config • Viewing costs nothing` });
  const controls = [];
  if (pages > 1) controls.push(row(
    new ButtonBuilder().setCustomId(lootId(owner, source, difficulty, page - 1, "prev"))
      .setLabel("Previous").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId(lootId(owner, source, difficulty, page + 1, "next"))
      .setLabel("Next").setStyle(ButtonStyle.Secondary).setDisabled(page === pages - 1)
  ));
  if (source === "current") {
    controls.push(row(...["easy", "normal", "hard"].filter(key => Object.hasOwn(dungeonLootTables, key)).map(key =>
      new ButtonBuilder().setCustomId(lootId(owner, "current", key, 0, "choose"))
        .setLabel(key[0].toUpperCase() + key.slice(1)).setStyle(ButtonStyle.Primary).setDisabled(key === difficulty)
    )));
  }
  return { embeds: [embed], components: controls, allowedMentions: quiet };
}

async function handleLootPagination(interaction) {
  const parts = interaction.customId.split(":");
  const [, , owner, source, difficulty, pageText, action] = parts;
  if (parts.length !== 7 || !/^\d{1,25}$/.test(owner ?? "") ||
    !(source === "current" || /^[0-9a-f-]{36}$/.test(source ?? "")) ||
    !Object.hasOwn(dungeonLootTables, difficulty ?? "") || !/^-?\d{1,6}$/.test(pageText ?? "") ||
    !["prev", "next", "choose"].includes(action)) {
    await interaction.reply({ content: "Invalid loot control. Use !dungeon loot.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (interaction.user.id !== owner) {
    await interaction.reply({ content: "Open your own loot browser with !dungeon loot.", flags: MessageFlags.Ephemeral });
    return true;
  }
  await interaction.deferUpdate();
  try {
    const table = source === "current"
      ? snapshotLootTable(dungeonLootTables[difficulty], ITEMS)
      : (await dungeon.act(interaction.guildId, owner, source, 0, "refresh")).run.state.lootTable;
    await interaction.editReply(lootView(table, difficulty, owner, source, Number(pageText)));
  } catch (error) {
    console.error("Loot table navigation failed:", error);
    await interaction.followUp({
      content: error instanceof DungeonError ? error.message :
        "Could not load this loot table. Use !dungeon loot to browse current odds.",
      flags: MessageFlags.Ephemeral, allowedMentions: quiet
    }).catch(console.error);
  }
  return true;
}

function dungeonView(run) {
  const state = run.state;
  const reward = state.dungeon.reward;
  const solo = (run.party_ids?.length ?? state.players.length) === 1;
  const embed = new EmbedBuilder().setTitle(`🏰 ${text(state.dungeon.name)} • ${solo ? "Solo" : "Co-op"}`)
    .setColor(run.status === "won" ? 0x2ecc71 : ongoing.includes(run.status) ? 0x63acff : 0xe74c3c);
  let components = [];

  if (run.status === "invited") {
    embed.setDescription(
      `<@${run.leader_id}> invited <@${run.partner_id}> to a **${text(state.difficulty)}** dungeon!\n\n` +
      `Clear all ${state.dungeon.rooms.length} rooms to earn **${money(reward)} per player**.\n` +
      (state.lootTable ? "Each player also gets one independent equipment drop roll.\n" : "") +
      `Free entry. Your entry cooldown starts on acceptance (**${Math.round(state.rules.cooldownMs / 60000)} minutes**).\n` +
      `Accept before <t:${Math.ceil(run.expires_at / 1000)}:R>.\n\n` +
      "Equip your gear before accepting. Both players need economy accounts."
    );
    components = [row(button(run, "accept", "Accept", ButtonStyle.Success), button(run, "decline", "Decline / Cancel", ButtonStyle.Danger))];
  } else if (state.players.length) {
    const room = Math.min(state.room + 1, state.dungeon.rooms.length);

    if (run.status === "active") {
      embed.setDescription(
        `⚔️ **ACTIVE** • Room ${room}/${state.dungeon.rooms.length} • Round ${state.roomRound}/${state.rules.maxRoundsPerRoom}\n` +
        `Enemy: **${text(state.enemy.name)}**\n` +
        `${healthBar(state.enemy.hp, state.enemy.maxHealth)}\n` +
        `Choose before <t:${Math.ceil(run.expires_at / 1000)}:R>. ` +
        (solo ? "Your action resolves the round immediately." : "Both living players must lock an action.")
      );
    } else {
      embed.setDescription(`**${run.status.toUpperCase()}** • Room ${room}/${state.dungeon.rooms.length}`);
    }

    for (const player of state.players) {
      const skill = (state.rules.skillRules ?? skills)[player.skill];
      const statusIcon = player.hp > 0 ? "🧑" : "💀";
      const statusText = player.hp > 0 ? "Party Member" : "Knocked Out";

      const fieldLines = [
        `**Status:** ${statusText} — <@${player.userId}>`,
        healthBar(player.hp, player.maxHealth),
        `⚔️ ATK ${player.attack} • 🛡️ DEF ${player.defense} • 💨 SPD ${player.speed} • 🎯 CRIT ${Number(((player.critChance ?? 0) * 100).toFixed(2))}%`,
        player.equipment
          ? `🎒 Gear: **${Object.keys(player.equipment).length}/11 slots** • Main: ${text(player.weaponName, 80)}`
          : `Legacy gear: ${text(player.weaponName)} / ${text(player.armorName)}`,
        `🐾 Passive: ${text(player.passives?.map(p => p.name).join(", ") || player.passive?.name || "None", 160)} | 🛡️ Shield: ${player.shield ?? 0}`,
        `🧪 Potions: ${player.potions} | ✨ Skill: ${skill ? `${skill.name} (${player.skillCooldown ? `${player.skillCooldown} turn cooldown` : "Ready"})` : "None"}`,
      ];

      if (run.status === "active") {
        fieldLines.push(`Action status: **${player.hp <= 0 ? "Knocked out" : player.choice ? "🔒 Locked" : "⏳ Waiting"}**`);
      }

      embed.addFields({
        name: `${statusIcon} Combatant #${state.players.indexOf(player) + 1}`,
        value: fieldLines.join("\n"),
        inline: false
      });
    }

    if (state.log.length) {
      embed.addFields({ name: "📜 Last Round", value: state.log.join("\n").slice(0, 1024), inline: false });
    }

    if (run.status === "active") {
      components = [
        row(
          button(run, "attack", "⚔️ Attack", ButtonStyle.Success),
          button(run, "defend", "🛡️ Defend", ButtonStyle.Primary),
          button(run, "skill", "✨ Weapon Skill", ButtonStyle.Success),
          button(run, "heal", "🧪 Potion", ButtonStyle.Primary),
          button(run, "refresh", "🔄 Refresh", ButtonStyle.Secondary)
        ),
        row(
          button(run, "loot", "🎁 Loot Table", ButtonStyle.Secondary),
          button(run, "leave", solo ? "Retreat — Ends Run" : "Retreat — Ends Party Run", ButtonStyle.Danger)
        ),
      ];
    }
  } else {
    embed.setDescription(`**${run.status.toUpperCase()}**\nThe invitation ended. No entry cooldown was started.`);
  }

  if (run.status === "won") {
    embed.addFields({
      name: "Clear Rewards", value: run.rewards.map((entry) =>
        `<@${entry.user_id}>: **${money(entry.amount)}** — ${entry.claimed_at == null ? "Ready to claim" : "Claimed"}` +
        `\n${entry.loot?.length ? "🎁 " + entry.loot.map(drop => `${text(drop.name, 60)} × ${drop.quantity}`).join(", ") :
          entry.loot_rolled ? "No equipment drop this time." : "Currency-only reward from an earlier run."}`
      ).join("\n\n").slice(0, 1024) || "Rewards are being prepared."
    });

    components = [row(
      button(run, "claim", "Claim My Reward", ButtonStyle.Success,
        run.rewards.length > 0 && run.rewards.every((entry) => entry.claimed_at != null)),
      button(run, "refresh", "Refresh", ButtonStyle.Secondary),
      button(run, "loot", "🎁 Loot Table", ButtonStyle.Secondary)
    )];
  }

  if (Array.isArray(state.lootTable) && run.status !== "won") {
    const total = state.lootTable.reduce((sum, entry) => sum + entry.weight, 0);
    const drops = state.lootTable.filter(entry => entry.itemId !== null);
    const itemWeight = drops.reduce((sum, entry) => sum + entry.weight, 0);
    if (total > 0) {
      embed.addFields({
        name: "🎁 Potential Loot",
        value: `**${percent(itemWeight, total)} equipment chance per player per clear.**\n` +
          (drops.slice(0, 4).map(entry => text(entry.name, 70)).join(" • ") || "Currency only") +
          (drops.length > 4 ? ` • and ${drops.length - 4} more` : ""),
        inline: false
      });
      if (run.status !== "active") {
        components.push(row(button(run, "loot", "🎁 Loot Table", ButtonStyle.Secondary)));
      }
    }
  }

  embed.setFooter({ text: "Combat totals include base stats • Gear saved on entry • Choices stay private • Use !dungeon or !dungeon rewards" });
  return { embeds: [embed], components, allowedMentions: quiet };
}

async function refreshPanel(message, guild, user, id) {
  const previous = publicEdits.get(id) ?? Promise.resolve();
  const task = previous.catch(() => { }).then(async () => {
    const result = await dungeon.act(guild, user, id, 0, "refresh");
    await message.edit({ ...dungeonView(result.run), content: null });
  });
  publicEdits.set(id, task);
  try { await task; }
  finally { if (publicEdits.get(id) === task) publicEdits.delete(id); }
}

export async function dungeonCommand(message) {
  if (!message.inGuild() || message.author.bot) return;
  const args = message.content.trim().split(/\s+/);
  try {
    if (["loot", "drops"].includes(args[1]?.toLowerCase())) {
      const difficulty = (args[2] ?? "easy").toLowerCase();
      if (args.length > 3 || !Object.hasOwn(dungeonLootTables, difficulty)) {
        await message.reply({ content: "Usage: `!dungeon loot [easy|normal|hard]`", allowedMentions: quiet });
        return;
      }
      await message.reply(lootView(snapshotLootTable(dungeonLootTables[difficulty], ITEMS), difficulty, message.author.id));
      return;
    }
    let run;
    let invited = false;
    if (args.length === 1 || (args.length === 2 && args[1].toLowerCase() === "rewards")) {
      const rewardsOnly = args.length === 2;
      run = await dungeon.current(message.guildId, message.author.id, rewardsOnly);
      if (!run) {
        await message.reply({
          content: rewardsOnly ? "You have no unclaimed dungeon rewards." :
            "Solo: `!dungeon solo easy`\nCo-op: `!dungeon @friend easy`\n" +
            "Difficulties: `easy`, `normal`, `hard`.\nResume: `!dungeon`\nUnclaimed rewards: `!dungeon rewards`\nLoot tables: `!dungeon loot [easy|normal|hard]`", allowedMentions: quiet
        });
        return;
      }
    } else if (args[1]?.toLowerCase() === "solo") {
      const difficulty = (args[2] ?? "easy").toLowerCase();
      if (args.length > 3 || !Object.hasOwn(dungeonConfig.difficulties, difficulty)) {
        await message.reply("Usage: `!dungeon solo [easy|normal|hard]`"); return;
      }
      run = await dungeon.create(message.guildId, message.channelId, message.author.id, null, difficulty, message.author.username);
    } else {
      const mention = args[1]?.match(/^<@!?(\d+)>$/);
      const partner = mention ? message.mentions.users.get(mention[1]) : null;
      const difficulty = (args[2] ?? "easy").toLowerCase();
      if (!partner || args.length > 3 || !Object.hasOwn(dungeonConfig.difficulties, difficulty)) {
        await message.reply("Usage: `!dungeon @friend [easy|normal|hard]` or `!dungeon solo [easy|normal|hard]`"); return;
      }
      if (partner.bot || partner.id === message.author.id) {
        await message.reply("Choose another human player for your dungeon party."); return;
      }
      try { await message.guild.members.fetch(partner.id); }
      catch { await message.reply("Could not verify that player is in this server."); return; }
      run = await dungeon.create(message.guildId, message.channelId, message.author.id, partner.id, difficulty, message.author.username, partner.username);
      invited = true;
    }
    await message.reply({
      ...dungeonView(run), ...(invited ? {
        content: `<@${run.partner_id}>`, allowedMentions: { parse: [], users: [run.partner_id], repliedUser: false },
      } : {})
    });
  } catch (error) {
    console.error("Dungeon command failed:", error);
    await message.reply({
      content: error instanceof DungeonError ? error.message :
        "Could not load or confirm the dungeon. Use !dungeon to check your saved run before trying again.", allowedMentions: quiet
    }).catch(console.error);
  }
}

export async function handleDungeonInteraction(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith("dg:")) return false;
  if (!interaction.inGuild()) {
    await interaction.reply({ content: "Dungeons are available inside a server.", flags: MessageFlags.Ephemeral }); return true;
  }
  if (interaction.customId.startsWith("dg:loot:")) return handleLootPagination(interaction);
  const parts = interaction.customId.split(":");
  const [, id, roundText, action] = parts;
  if (parts.length !== 4 || !/^[0-9a-f-]{36}$/.test(id ?? "") || !/^\d+$/.test(roundText ?? "") ||
    !["accept", "decline", "attack", "defend", "skill", "heal", "refresh", "leave", "claim", "loot"].includes(action)) {
    await interaction.reply({ content: "Invalid dungeon control. Use !dungeon.", flags: MessageFlags.Ephemeral }); return true;
  }
  if (action === "loot") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const { run } = await dungeon.act(interaction.guildId, interaction.user.id, id, 0, "refresh");
      await interaction.editReply(lootView(run.state.lootTable, run.state.difficulty ?? "easy", interaction.user.id, run.id));
    } catch (error) {
      console.error("Dungeon loot view failed:", error);
      await interaction.editReply({
        content: error instanceof DungeonError ? error.message :
          "Could not load this run's loot. Use !dungeon loot to browse current odds.", allowedMentions: quiet
      }).catch(console.error);
    }
    return true;
  }
  const claiming = action === "claim";
  if (claiming) await interaction.deferReply();
  else await interaction.deferUpdate();
  let result;
  try {
    result = await dungeon.act(interaction.guildId, interaction.user.id, id, Number(roundText), action);
  } catch (error) {
    console.error("Dungeon action failed:", error);
    const data = {
      content: error instanceof DungeonError ? error.message :
        "Could not confirm the action. Use !dungeon or !dungeon rewards to check before retrying.", allowedMentions: quiet
    };
    if (claiming) await interaction.editReply(data).catch(console.error);
    else await interaction.followUp({ ...data, flags: MessageFlags.Ephemeral }).catch(console.error);
    return true;
  }
  let content = "";
  if (result.receipt) {
    const receipt = result.receipt;
    content = receipt.alreadyClaimed ? "You already claimed this run's reward." :
      `Claimed **${money(receipt.amount)}**! Balance: **${money(receipt.balance)}**.`;
    if (receipt.items?.length) content += "\n🎁 " + receipt.items.map(item =>
      `**${text(item.name, 60)} #${item.serialNumber}** — equip with \`!equip ${item.itemId} ${item.serialNumber}\``
    ).join("\n");
  }
  try { await refreshPanel(interaction.message, interaction.guildId, interaction.user.id, id); }
  catch (error) {
    console.error("Dungeon state saved but panel refresh failed:", error);
    const notice = "The action was saved, but the panel could not refresh. Use !dungeon to reopen it.";
    if (claiming) content += "\n" + notice;
    else await interaction.followUp({ content: notice, flags: MessageFlags.Ephemeral, allowedMentions: quiet }).catch(console.error);
  }
  if (claiming) await interaction.editReply({ content: content || "Reward checked.", allowedMentions: quiet }).catch(console.error);
  return true;
}