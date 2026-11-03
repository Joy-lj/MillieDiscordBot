import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
} from "discord.js";

import {
  getUserInventory,
  getUserCombatStats,
  ITEMS,
} from "../database/items.js";

import { economyConfig } from "../config/economy.js";
import { rarityEmoji } from "../utils/rarityEmojis.js";

const quiet = { parse: [], repliedUser: false };
const PER_PAGE = 10;
const SERIALS_PER_PAGE = 20;

const clean = (value, max = 65) =>
  String(value ?? "")
    .replace(/[`*_~|<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const num = (value) =>
  Number(value ?? 0).toLocaleString("en-US");

const row = (...items) =>
  new ActionRowBuilder().addComponents(items);

const SLOTS = {
  main_hand: "⚔️ Main hand",
  off_hand: "🛡️ Off hand",
  head: "🪖 Head",
  torso: "👕 Torso",
  legs: "👖 Legs",
  hands: "🧤 Hands",
  feet: "🥾 Feet",
  cape: "🧣 Cape",
  neck: "📿 Necklace",
  ring: "💍 Ring",
  ammo: "🏹 Ammo",
};

function groupInventory(inventory, equippedIds) {
  const groups = new Map();

  for (const owned of inventory) {
    if (!groups.has(owned.item_id)) {
      groups.set(owned.item_id, {
        id: owned.item_id,
        item: Object.hasOwn(ITEMS, owned.item_id)
          ? ITEMS[owned.item_id]
          : null,
        copies: [],
        equipped: 0,
      });
    }

    const group = groups.get(owned.item_id);
    group.copies.push(owned);

    if (equippedIds.has(String(owned.id))) {
      group.equipped += 1;
    }
  }

  for (const group of groups.values()) {
    group.copies.sort(
      (a, b) => Number(a.serial_number) - Number(b.serial_number)
    );
  }

  return [...groups.values()].sort((a, b) =>
    (a.item?.name ?? a.id).localeCompare(b.item?.name ?? b.id)
  );
}

function bonusLine(stats = {}) {
  const crit = Number(
    (Number(stats.critChance ?? 0) * 100).toFixed(2)
  );

  return (
    `⚔️ ${num(stats.attack)} ATK • ` +
    `🛡️ ${num(stats.defense)} DEF • ` +
    `❤️ ${num(stats.health)} HP • ` +
    `💨 ${num(stats.speed)} SPD • ` +
    `🎯 ${num(crit)}% CRIT`
  );
}

function inventoryView(
  state,
  prefix,
  username,
  expired = false
) {
  const { stats, groups, equippedIds } = state;

  const group = groups.find(
    (entry) => entry.id === state.itemId
  );

  const detail = state.view === "item" && group;
  const loadout = state.view === "loadout";

  const pages = detail
    ? Math.max(1, Math.ceil(group.copies.length / SERIALS_PER_PAGE))
    : loadout
      ? 1
      : Math.max(1, Math.ceil(groups.length / PER_PAGE));

  state.page = Math.max(0, Math.min(state.page, pages - 1));

  const embed = new EmbedBuilder()
    .setColor(0x00ae86)
    .setTitle(
      `🎒 ${clean(username)}'s ${loadout ? "Loadout" : "Inventory"}`
    );

  const money =
    `${economyConfig.currencyEmoji ?? "💰"} ` +
    `**${num(stats.balance)} ${clean(economyConfig.currencyName)}**`;

  const components = [];

  const button = (
    action,
    label,
    disabled = false,
    style = ButtonStyle.Secondary
  ) =>
    new ButtonBuilder()
      .setCustomId(`${prefix}:${action}`)
      .setLabel(label)
      .setStyle(style)
      .setDisabled(expired || disabled);

  if (detail) {
    const item = group.item;

    const icon = item
      ? rarityEmoji(item.dungeon?.rarity ?? "common")
      : "❓";

    embed
      .setTitle(`${icon} ${clean(item?.name ?? group.id)}`)
      .setDescription(
        `Owned: **${num(group.copies.length)}** • ` +
        `Equipped: **${num(group.equipped)}**\n` +
        (
          item
            ? `${clean(item.type)} • ` +
            `${clean(item.slot).replace(/_/g, " ")}\n` +
            `${bonusLine(item.stats)}\n\n`
            : "This item's definition is missing.\n\n"
        ) +
        `Item ID: \`${clean(group.id, 90)}\`\n` +
        "Equip a copy: `!equip <item-id> <serial-number>`"
      );

    const copies = group.copies.slice(
      state.page * SERIALS_PER_PAGE,
      (state.page + 1) * SERIALS_PER_PAGE
    );

    embed.addFields({
      name: "Serial numbers • ✅ equipped",
      value: copies
        .map(
          (copy) =>
            `\`#${copy.serial_number}\`` +
            (equippedIds.has(String(copy.id)) ? " ✅" : "")
        )
        .join(" • "),
    });

    components.push(
      row(
        button("back", "Back to inventory"),
        button("refresh", "Refresh")
      )
    );
  } else if (loadout) {
    // Only show occupied slots to keep this panel compact.
    const lines = Object.entries(SLOTS).flatMap(
      ([slot, label]) => {
        const equipped = stats.equipment?.[slot];

        return equipped
          ? [
            `${label}: **${clean(equipped.item.name)} ` +
            `#${equipped.serialNumber}**`,
          ]
          : [];
      }
    );

    embed
      .setDescription(
        `${money}\n\n` +
        (lines.join("\n") || "No gear equipped yet.")
      )
      .addFields({
        name: "Equipment bonuses",
        value: bonusLine(stats),
      });

    components.push(
      row(
        button("back", "Inventory"),
        button("refresh", "Refresh")
      )
    );
  } else {
    const shown = groups.slice(
      state.page * PER_PAGE,
      (state.page + 1) * PER_PAGE
    );

    const lines = shown.map((entry) => {
      const icon = entry.item
        ? rarityEmoji(entry.item.dungeon?.rarity ?? "common")
        : "❓";

      return (
        `${icon} **${clean(entry.item?.name ?? entry.id)}** ` +
        `×${num(entry.copies.length)}` +
        (entry.equipped ? ` • ✅ ${entry.equipped}` : "")
      );
    });

    embed.setDescription(
      `${money}\n\n` +
      (
        lines.join("\n") ||
        "Your inventory is empty. Visit !shop or earn dungeon loot."
      ) +
      (
        shown.length
          ? "\n\nSelect an item to view its stats and serial numbers."
          : ""
      )
    );

    if (shown.length) {
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`${prefix}:pick`)
        .setPlaceholder("View an item and its copies")
        .setDisabled(expired)
        .addOptions(
          shown.map((entry) => ({
            label:
              `${entry.item?.name ?? entry.id} ×${entry.copies.length}`
                .slice(0, 100),
            description:
              `${entry.item?.type ?? "Unknown item"} • ` +
              `${entry.equipped} equipped`,
            value: entry.id,
          }))
        );

      components.push(row(menu));
    }

    components.push(
      row(
        button("loadout", "Loadout", false, ButtonStyle.Primary),
        button("refresh", "Refresh")
      )
    );
  }

  if (pages > 1) {
    components.push(
      row(
        button("previous", "Previous", state.page === 0),
        button("next", "Next", state.page === pages - 1)
      )
    );
  }

  const count = groups.reduce(
    (sum, entry) => sum + entry.copies.length,
    0
  );

  embed.setFooter({
    text: expired
      ? "Controls expired • Use !inventory to reopen"
      : `${num(count)} items • ${groups.length} item types • ` +
      `Page ${state.page + 1}/${pages}`,
  });

  return {
    embeds: [embed],
    components,
    allowedMentions: quiet,
  };
}

export async function inventoryCommand(message) {
  if (!message.inGuild() || message.author.bot) return;

  const prefix = `inventory:${message.id}`;

  const state = {
    view: "inventory",
    page: 0,
    inventoryPage: 0,
    itemId: null,
  };

  async function refresh() {
    const [inventory, stats] = await Promise.all([
      getUserInventory(message.guildId, message.author.id),
      getUserCombatStats(message.guildId, message.author.id),
    ]);

    const equippedIds = new Set(
      (stats.equippedInstanceIds ?? []).map(String)
    );

    state.stats = stats;
    state.equippedIds = equippedIds;
    state.groups = groupInventory(inventory, equippedIds);

    // Return to the list if the selected item was sold or removed.
    if (
      state.view === "item" &&
      !state.groups.some((group) => group.id === state.itemId)
    ) {
      state.view = "inventory";
      state.page = state.inventoryPage;
      state.itemId = null;
    }
  }

  try {
    await refresh();
  } catch (error) {
    console.error("Inventory load failed:", error);

    return message.reply({
      content: "Couldn't load your inventory. Check the bot log.",
      allowedMentions: quiet,
    });
  }

  const view = (expired = false) =>
    inventoryView(
      state,
      prefix,
      message.author.username,
      expired
    );

  const reply = await message.reply(view());

  const collector = reply.createMessageComponentCollector({
    time: 120_000,
    filter: (interaction) =>
      (
        interaction.isButton() ||
        interaction.isStringSelectMenu()
      ) &&
      interaction.customId.startsWith(`${prefix}:`),
  });

  let updates = Promise.resolve();

  collector.on("collect", async (interaction) => {
    try {
      if (interaction.user.id !== message.author.id) {
        await interaction.reply({
          content: "Use !inventory to open your own inventory.",
          flags: MessageFlags.Ephemeral,
        });

        return;
      }

      // Preserve click order while acknowledging promptly.
      const acknowledgement = interaction
        .deferUpdate()
        .then(() => null, (error) => error);

      updates = updates
        .then(async () => {
          const ackError = await acknowledgement;
          if (ackError) throw ackError;
          if (collector.ended) return;

          const action = interaction.customId.slice(
            prefix.length + 1
          );

          if (action === "refresh") {
            await refresh();
          } else if (
            action === "pick" &&
            interaction.isStringSelectMenu()
          ) {
            const selected = interaction.values[0];

            const shown = state.groups.slice(
              state.page * PER_PAGE,
              (state.page + 1) * PER_PAGE
            );

            if (
              state.view !== "inventory" ||
              !shown.some((entry) => entry.id === selected)
            ) {
              return;
            }

            state.inventoryPage = state.page;
            state.itemId = selected;
            state.view = "item";
            state.page = 0;
          } else if (action === "loadout") {
            state.inventoryPage = state.page;
            state.view = "loadout";
            state.page = 0;
          } else if (action === "back") {
            state.view = "inventory";
            state.page = state.inventoryPage;
          } else if (
            action === "previous" ||
            action === "next"
          ) {
            state.page += action === "next" ? 1 : -1;
          } else {
            return;
          }

          await reply.edit(view());
        })
        .catch(async (error) => {
          console.error("Inventory update failed:", error);

          await interaction.followUp({
            content:
              "Couldn't update the inventory. " +
              "Use !inventory to reopen it.",
            flags: MessageFlags.Ephemeral,
            allowedMentions: quiet,
          }).catch(console.error);
        });
    } catch (error) {
      console.error("Inventory interaction failed:", error);
    }
  });

  collector.on("end", () => {
    void updates
      .then(() => reply.edit(view(true)))
      .catch(console.error);
  });

  return reply;
}