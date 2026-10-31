import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from "discord.js";
import { dungeon } from "../database/dungeon.js";
import { dungeonConfig } from "../config/dungeon.js";
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
      `Clear all three rooms to earn **${money(reward)} per player**.\n` +
      `Free entry. Your entry cooldown starts on acceptance (**${Math.round(state.rules.cooldownMs / 60000)} minutes**).\n` +
      `Accept before <t:${Math.ceil(run.expires_at / 1000)}:R>.\n\n` +
      "Equip your gear before accepting. Both players need economy accounts."
    );
    components = [row(button(run, "accept", "Accept", ButtonStyle.Success), button(run, "decline", "Decline / Cancel", ButtonStyle.Danger))];
  } else if (state.players.length) {
    const room = Math.min(state.room + 1, state.dungeon.rooms.length);
    embed.setDescription(
      `**${run.status.toUpperCase()}** • Room ${room}/${state.dungeon.rooms.length}` +
      (run.status === "active" ? ` • Round ${state.roomRound}/${state.rules.maxRoundsPerRoom}\n` +
        `Enemy: **${text(state.enemy.name)} — ${state.enemy.hp}/${state.enemy.maxHealth} HP**\n` +
        `Choose before <t:${Math.ceil(run.expires_at / 1000)}:R>. ` +
        (solo ? "Your action resolves the round immediately." : "Both living players must lock an action.") : "")
    );
    for (const player of state.players) {
      const skill = skills[player.skill];
      embed.addFields({
        name: player.hp > 0 ? "🧑 Party member" : "💀 Knocked out", value:
          `<@${player.userId}> • **${player.hp}/${player.maxHealth} HP**\n` +
          `ATK ${player.attack} • DEF ${player.defense} • SPD ${player.speed}\n` +
          `${text(player.weaponName)} / ${text(player.armorName)}\n` +
          `Potions: ${player.potions} • Skill: ${skill ? `${skill.name} (${player.skillCooldown ? `${player.skillCooldown} turn cooldown` : "ready"})` : "none"}` +
          (run.status === "active" ? `\nAction: ${player.hp <= 0 ? "knocked out" : player.choice ? "🔒 locked" : "waiting"}` : ""), inline: false
      });
    }
    if (state.log.length) embed.addFields({ name: "Last round", value: state.log.join("\n").slice(0, 1024) });
    if (run.status === "active") {
      components = [
        row(button(run, "attack", "⚔️ Attack", ButtonStyle.Primary), button(run, "defend", "🛡️ Defend"),
          button(run, "skill", "✨ Weapon skill"), button(run, "heal", "🧪 Use potion"), button(run, "refresh", "Refresh")),
        row(button(run, "leave", solo ? "Retreat — ends run" : "Retreat — ends party run", ButtonStyle.Danger)),
      ];
    }
  } else {
    embed.setDescription(`**${run.status.toUpperCase()}**\nThe invitation ended. No entry cooldown was started.`);
  }
  if (run.status === "won") {
    embed.addFields({
      name: "Clear rewards", value: run.rewards.map((entry) =>
        `<@${entry.user_id}>: **${money(entry.amount)}** — ${entry.claimed_at == null ? "ready to claim" : "claimed"}`
      ).join("\n") || "Rewards are being prepared."
    });
    components = [row(button(run, "claim", "Claim my reward", ButtonStyle.Success,
      run.rewards.length > 0 && run.rewards.every((entry) => entry.claimed_at != null)), button(run, "refresh", "Refresh"))];
  }
  embed.setFooter({ text: "Equipment is saved on entry • Choices stay private • !dungeon resumes • !dungeon rewards finds unclaimed rewards" });
  return { embeds: [embed], components, allowedMentions: quiet };
}

async function refreshPanel(message, guild, user, id) {
  // Prevent concurrent local edits from replacing a newer round with an old one.
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
    let run;
    let invited = false;
    if (args.length === 1 || (args.length === 2 && args[1].toLowerCase() === "rewards")) {
      const rewardsOnly = args.length === 2;
      run = await dungeon.current(message.guildId, message.author.id, rewardsOnly);
      if (!run) {
        await message.reply({
          content: rewardsOnly ? "You have no unclaimed dungeon rewards." :
            "Solo: `!dungeon solo easy`\nCo-op: `!dungeon @friend easy`\n" +
            "Difficulties: `easy`, `normal`, `hard`.\nResume: `!dungeon`\nUnclaimed rewards: `!dungeon rewards`", allowedMentions: quiet
        });
        return;
      }
    } else if (args[1]?.toLowerCase() === "solo") {
      const difficulty = (args[2] ?? "easy").toLowerCase();
      if (args.length > 3 || !Object.hasOwn(dungeonConfig.difficulties, difficulty)) {
        await message.reply("Usage: `!dungeon solo [easy|normal|hard]`"); return;
      }
      run = await dungeon.create(message.guildId, message.channelId, message.author.id, null, difficulty);
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
      run = await dungeon.create(message.guildId, message.channelId, message.author.id, partner.id, difficulty);
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
  if (
    !interaction.isButton() ||
    !interaction.customId.startsWith("dg:")
  ) {
    return false;
  }

  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "Dungeons are available inside a server.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const parts = interaction.customId.split(":");
  const [, id, roundText, action] = parts;
  const round = Number(roundText);

  const validActions = [
    "accept", "decline", "attack", "defend", "skill",
    "heal", "refresh", "leave", "claim",
  ];

  if (
    parts.length !== 4 ||
    !/^[0-9a-f-]{36}$/.test(id ?? "") ||
    !/^\d+$/.test(roundText ?? "") ||
    !Number.isSafeInteger(round) ||
    !validActions.includes(action)
  ) {
    await interaction.reply({
      content: "Invalid dungeon control. Use !dungeon.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const isClaim = action === "claim";

  if (isClaim) {
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });
  } else {
    // Acknowledge the click without creating another message.
    await interaction.deferUpdate();
  }

  async function privateMessage(content) {
    const data = { content, allowedMentions: quiet };

    if (isClaim) {
      await interaction.editReply(data);
    } else {
      await interaction.followUp({
        ...data,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  let result;

  try {
    result = await dungeon.act(
      interaction.guildId,
      interaction.user.id,
      id,
      round,
      action
    );
  } catch (error) {
    console.error("Dungeon action failed:", error);

    await privateMessage(
      error instanceof DungeonError
        ? error.message
        : "Could not confirm the action. Use !dungeon or !dungeon rewards to check before retrying."
    ).catch(console.error);

    return true;
  }

  let panelFailed = false;

  try {
    await refreshPanel(
      interaction.message,
      interaction.guildId,
      interaction.user.id,
      id
    );
  } catch (error) {
    console.error("Dungeon saved but panel refresh failed:", error);
    panelFailed = true;
  }

  if (isClaim) {
    const receipt = result.receipt;

    const content = receipt?.alreadyClaimed
      ? "You already claimed this run's reward."
      : receipt
        ? `Claimed **${money(receipt.amount)}**! Balance: **${money(receipt.balance)}**.`
        : "No reward was claimed.";

    await privateMessage(
      content +
      (panelFailed
        ? " Use !dungeon rewards to refresh the display."
        : "")
    ).catch(console.error);
  } else if (panelFailed) {
    await privateMessage(
      "Your action was saved, but the panel could not refresh. Use !dungeon to reopen it."
    ).catch(console.error);
  }

  return true;
}