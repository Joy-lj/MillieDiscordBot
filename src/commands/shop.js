import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

import { randomUUID } from "node:crypto";
import { ITEMS, buyItem } from "../database/items.js";
import { economyConfig } from "../config/economy.js";

const quiet = { parse: [], repliedUser: false };

const ITEMS_PER_PAGE = 25;
const MAX_QUANTITY = 100;
const SHOP_TIMEOUT = 120_000;
const CONFIRM_TIMEOUT = 60_000;
const MODAL_TIMEOUT = 180_000;

const money = (amount) =>
  `${amount.toLocaleString("en-US")} ${economyConfig.currencyName}`;

const clean = (value, max = 100) =>
  String(value ?? "")
    .slice(0, max)
    .replace(/([\\`*_~|>])/g, "\\$1");

const row = (...components) =>
  new ActionRowBuilder().addComponents(components);

const canBuy = (item) =>
  item &&
  item.purchasable !== false &&
  item.source !== "dungeon";

const ownItem = (id) =>
  Object.hasOwn(ITEMS, id) ? ITEMS[id] : null;

function button(
  id,
  label,
  style = ButtonStyle.Secondary,
  disabled = false
) {
  return new ButtonBuilder()
    .setCustomId(id)
    .setLabel(label.slice(0, 80))
    .setStyle(style)
    .setDisabled(disabled);
}

function normalize(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function validateQuantity(quantity) {
  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_QUANTITY
  ) {
    throw new Error(
      `Choose a whole-number quantity from 1 to ${MAX_QUANTITY}.`
    );
  }
}

function parsePurchase(content) {
  const tokens = content.trim().split(/\s+/).slice(1);
  let quantity = 1;

  if (
    tokens.length &&
    /^[+-]?\d+(?:\.\d+)?$/.test(tokens.at(-1))
  ) {
    quantity = Number(tokens.pop());
  }

  const query = tokens
    .join(" ")
    .replace(/^(["'])(.*)\1$/, "$2")
    .trim();

  if (!query || !normalize(query)) {
    throw new Error(
      "Usage: `!buy <name or item-id> [quantity]`\n" +
      "Example: `!buy feather 2`"
    );
  }

  validateQuantity(quantity);
  return { query, quantity };
}

function findItems(query) {
  const entries = Object.entries(ITEMS).filter(
    ([, item]) => canBuy(item)
  );

  const raw = query.trim().toLowerCase();
  const exactId = entries.find(
    ([id]) => id.toLowerCase() === raw
  );

  if (exactId) return [exactId];

  const key = normalize(query);
  if (!key) return [];

  const exact = entries.filter(
    ([id, item]) =>
      normalize(id) === key ||
      normalize(item.name) === key
  );

  if (exact.length) return exact;

  const terms = key.split(" ");

  return entries.filter(([id, item]) => {
    const haystack =
      `${normalize(id)} ${normalize(item.name)}`;

    return terms.every(
      (term) =>
        haystack.includes(term) ||
        (
          term.length > 3 &&
          term.endsWith("s") &&
          !term.endsWith("ss") &&
          haystack.includes(term.slice(0, -1))
        )
    );
  });
}

function itemDetails(item) {
  const d = item.dungeon ?? {};

  const primary = item.type === "weapon"
    ? `⚔️ Attack +${item.stat}`
    : `🛡️ Defense +${item.stat}`;

  const extras = [];

  if (d.healthBonus != null) {
    extras.push(`HP +${d.healthBonus}`);
  }

  if (d.speedBonus != null) {
    extras.push(
      `Speed ${d.speedBonus >= 0 ? "+" : ""}${d.speedBonus}`
    );
  }

  if (d.critChance != null) {
    extras.push(`Crit ${Math.round(d.critChance * 100)}%`);
  }

  return (
    primary +
    (extras.length ? ` • ${extras.join(" • ")}` : "")
  );
}

async function notifyError(interaction, content) {
  const data = {
    content,
    flags: MessageFlags.Ephemeral,
    allowedMentions: quiet,
  };

  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(data);
    } else {
      await interaction.reply(data);
    }
  } catch (error) {
    console.error("Shop error message failed:", error);
  }
}

function ownerFilter(owner, allowedIds) {
  return (interaction) => {
    if (
      !interaction.isButton() ||
      !allowedIds.includes(interaction.customId)
    ) {
      return false;
    }

    if (interaction.user.id !== owner) {
      void notifyError(
        interaction,
        "These controls belong to another player. Use !shop."
      );
      return false;
    }

    return true;
  };
}

function failureText(result) {
  if (result.reason === "insufficient_funds") {
    return `❌ You need **${money(result.price)}** for this purchase.`;
  }

  if (result.reason === "dungeon_only") {
    return "That equipment can only drop from dungeons.";
  }

  if (result.reason === "invalid_item") {
    return "That item is no longer available. Refresh !shop.";
  }

  if (result.reason === "invalid_quantity") {
    return "That quantity or purchase total exceeds the supported limit.";
  }

  return "The purchase could not be completed.";
}

function receiptView(result) {
  const shown = result.addedItems.slice(0, 10);
  const rest = result.addedItems.length - shown.length;

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle("🛍️ Purchase Complete")
    .setDescription(
      `Bought **${result.quantity.toLocaleString("en-US")} × ` +
      `${clean(result.item)}**!\n\n` +
      `Total paid: **${money(result.price)}**\n` +
      `Balance: **${money(result.newBalance)}**\n\n` +
      `Serials: ${shown.map((item) => `#${item.serial_number}`).join(", ")}` +
      (rest ? `, and ${rest.toLocaleString("en-US")} more` : "")
    );

  return {
    content: null,
    embeds: [embed],
    components: [],
    allowedMentions: quiet,
  };
}

async function purchasePreview({
  guild,
  owner,
  itemId,
  quantity,
  send,
  edit,
}) {
  validateQuantity(quantity);

  const item = ownItem(itemId);

  if (!canBuy(item)) {
    throw new Error(
      "That item is not available for purchase. Check !shop."
    );
  }

  const unitPrice = item.price;
  const total = unitPrice * quantity;

  if (!Number.isSafeInteger(total) || total < 1) {
    throw new Error("Purchase total exceeds the supported limit.");
  }

  const prefix = `ebuy:${randomUUID()}`;
  const confirmId = `${prefix}:confirm`;
  const cancelId = `${prefix}:cancel`;

  const preview = await send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xffaa00)
        .setTitle("Confirm Item Purchase")
        .setDescription(
          `**${quantity.toLocaleString("en-US")} × ${clean(item.name)}**\n` +
          `${itemDetails(item)}\n\n` +
          `Unit price: **${money(unitPrice)}**\n` +
          `Total: **${money(total)}**\n\n` +
          "Confirm within 60 seconds to purchase."
        ),
    ],
    components: [
      row(
        button(
          confirmId,
          "Confirm purchase",
          ButtonStyle.Success
        ),
        button(cancelId, "Cancel", ButtonStyle.Danger)
      ),
    ],
    allowedMentions: quiet,
  });

  // Private messages must be edited through their interaction.
  const update = edit ?? ((data) => preview.edit(data));

  let click;

  try {
    click = await preview.awaitMessageComponent({
      filter: ownerFilter(owner, [confirmId, cancelId]),
      time: CONFIRM_TIMEOUT,
    });
  } catch (error) {
    if (error.code !== "InteractionCollectorError") throw error;

    await update({
      content: "Purchase confirmation expired. No purchase was made.",
      embeds: [],
      components: [],
      allowedMentions: quiet,
    }).catch(console.error);

    return;
  }

  await click.deferUpdate();

  if (click.customId === cancelId) {
    await update({
      content: "Purchase canceled. No currency was spent.",
      embeds: [],
      components: [],
      allowedMentions: quiet,
    }).catch(console.error);

    return;
  }

  if (
    !canBuy(ownItem(itemId)) ||
    ITEMS[itemId].price !== unitPrice
  ) {
    await update({
      content: "This item's price or availability changed. Refresh !shop.",
      embeds: [],
      components: [],
      allowedMentions: quiet,
    }).catch(console.error);

    return;
  }

  let result;

  try {
    result = await buyItem(guild, owner, itemId, quantity);
  } catch (error) {
    console.error("Item purchase could not be confirmed:", error);

    await update({
      content:
        "Couldn't confirm the purchase. " +
        "Check your inventory and balance before trying again.",
      embeds: [],
      components: [],
      allowedMentions: quiet,
    }).catch(console.error);

    return;
  }

  // Display failure must never trigger a second purchase.
  try {
    await update(
      result.success
        ? receiptView(result)
        : {
          content: failureText(result),
          embeds: [],
          components: [],
          allowedMentions: quiet,
        }
    );
  } catch (error) {
    console.error(
      "Purchase finished but receipt display failed:",
      error
    );
  }
}

async function quantityModal(interaction, itemId, guild, owner) {
  const item = ownItem(itemId);

  if (!canBuy(item)) {
    await notifyError(
      interaction,
      "That item is not available for purchase."
    );
    return;
  }

  const modalId = `eqmodal:${interaction.id}`;

  const input = new TextInputBuilder()
    .setCustomId("quantity")
    .setLabel(`Quantity (1–${MAX_QUANTITY})`)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue("1")
    .setMaxLength(String(MAX_QUANTITY).length);

  const modal = new ModalBuilder()
    .setCustomId(modalId)
    .setTitle(`Buy ${item.name}`.slice(0, 45))
    .addComponents(row(input));

  await interaction.showModal(modal);

  let submitted;

  try {
    submitted = await interaction.awaitModalSubmit({
      filter: (submission) =>
        submission.customId === modalId &&
        submission.user.id === owner,
      time: MODAL_TIMEOUT,
    });
  } catch (error) {
    if (error.code !== "InteractionCollectorError") throw error;
    return;
  }

  await submitted.deferReply({
    flags: MessageFlags.Ephemeral,
  });

  try {
    const raw = submitted.fields
      .getTextInputValue("quantity")
      .trim();

    if (!/^\d+$/.test(raw)) {
      throw new Error(
        `Enter a whole-number quantity from 1 to ${MAX_QUANTITY}.`
      );
    }

    const quantity = Number(raw);
    validateQuantity(quantity);

    await purchasePreview({
      guild,
      owner,
      itemId,
      quantity,
      send: (data) => submitted.editReply(data),
      edit: (data) => submitted.editReply(data),
    });
  } catch (error) {
    console.error("Shop quantity/preview failed:", error);

    await submitted.editReply({
      content: error.message,
      embeds: [],
      components: [],
      allowedMentions: quiet,
    }).catch(console.error);
  }
}

const categories = {
  weapon: { label: "Weapons", icon: "⚔️" },
  armor: { label: "Armor", icon: "🛡️" },
};

function categoryItems(category) {
  return Object.entries(ITEMS)
    .filter(
      ([, item]) => canBuy(item) && item.type === category
    )
    .sort(
      (a, b) =>
        a[1].price - b[1].price ||
        a[1].name.localeCompare(b[1].name)
    );
}

function shopView(state, prefix, expired = false) {
  const entries = categoryItems(state.category);
  const pages = Math.max(
    1,
    Math.ceil(entries.length / ITEMS_PER_PAGE)
  );

  const selected = entries.find(
    ([id]) => id === state.selected
  );

  const page = selected
    ? Math.floor(entries.indexOf(selected) / ITEMS_PER_PAGE)
    : Math.max(0, Math.min(pages - 1, state.page));

  const shown = entries.slice(
    page * ITEMS_PER_PAGE,
    (page + 1) * ITEMS_PER_PAGE
  );

  const category = categories[state.category];
  const item = selected?.[1];

  const rarity = String(
    item?.dungeon?.rarity || "equipment"
  );

  const colors = {
    common: 0x95a5a6,
    uncommon: 0x2ecc71,
    rare: 0x3498db,
    epic: 0x9b59b6,
    legendary: 0xf1c40f,
    mythic: 0xe74c3c,
  };

  const embed = new EmbedBuilder()
    .setColor(colors[rarity.toLowerCase()] ?? 0xffaa00)
    .setTitle(
      item
        ? `${category.icon} ${clean(item.name, 100)}`
        : `🛒 Millie's Shop • ${category.label}`
    )
    .setDescription(
      item
        ? clean(
          item.description ||
          "Equipment from Millie's collection.",
          600
        )
        : "There are no items for sale in this category."
    );

  if (item) {
    const d = item.dungeon ?? {};

    embed.addFields(
      {
        name: "Price",
        value: `**${money(item.price)}**`,
        inline: true,
      },
      {
        name: "Rarity",
        value: clean(
          rarity[0].toUpperCase() + rarity.slice(1),
          40
        ),
        inline: true,
      },
      {
        name: "Stats",
        value: itemDetails(item),
        inline: false,
      }
    );

    if (d.ability) {
      embed.addFields({
        name: `✨ ${clean(d.ability.name, 80)}`,
        value:
          clean(
            d.ability.description ||
            "A special weapon ability.",
            700
          ) +
          (
            d.ability.cooldownTurns != null
              ? `\n**Cooldown:** ${d.ability.cooldownTurns} turns`
              : ""
          ),
        inline: false,
      });
    }

    if (d.passive) {
      embed.addFields({
        name: `🐾 ${clean(d.passive.name, 80)}`,
        value: clean(
          d.passive.description ||
          "An automatic armor effect.",
          700
        ),
        inline: false,
      });
    }

    embed.addFields({
      name: "Item ID",
      value: `\`${clean(selected[0], 100)}\``,
      inline: false,
    });
  }

  embed.setFooter({
    text: expired
      ? "Shop closed • Use !shop to reopen"
      : `${category.label} • ${entries.length} items • ` +
      `Page ${page + 1}/${pages} • Purchases require confirmation`,
  });

  const components = [
    row(
      button(
        `${prefix}:category:weapon`,
        "⚔️ Weapons",
        ButtonStyle.Primary,
        expired || state.category === "weapon"
      ),
      button(
        `${prefix}:category:armor`,
        "🛡️ Armor",
        ButtonStyle.Primary,
        expired || state.category === "armor"
      )
    ),
  ];

  if (shown.length) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`${prefix}:select`)
      .setPlaceholder(
        `Choose ${state.category === "weapon" ? "a weapon" : "armor"}`
      )
      .setDisabled(expired)
      .addOptions(
        shown.map(([id, candidate]) => ({
          label: candidate.name.slice(0, 100),
          value: id,
          description:
            `${money(candidate.price)} • ` +
            `${candidate.type === "weapon" ? "ATK" : "DEF"} ` +
            `${candidate.stat}`.slice(0, 20),
          default: id === selected?.[0],
        }))
      );

    components.push(row(menu));
  }

  if (pages > 1) {
    components.push(
      row(
        button(
          `${prefix}:previous`,
          "Previous items",
          ButtonStyle.Secondary,
          expired || page === 0
        ),
        button(
          `${prefix}:next`,
          "Next items",
          ButtonStyle.Secondary,
          expired || page === pages - 1
        )
      )
    );
  }

  if (item) {
    components.push(
      row(
        button(
          `${prefix}:buyone:${selected[0]}`,
          "Buy 1",
          ButtonStyle.Success,
          expired
        ),
        button(
          `${prefix}:buymany:${selected[0]}`,
          "Buy Multiple",
          ButtonStyle.Secondary,
          expired
        )
      )
    );
  }

  return {
    content: null,
    embeds: [embed],
    components,
    allowedMentions: quiet,
  };
}

export async function shopCommand(message) {
  if (!message.inGuild() || message.author.bot) return;

  const initialCategory = categoryItems("weapon").length
    ? "weapon"
    : "armor";

  const state = {
    category: initialCategory,
    page: 0,
    selected: categoryItems(initialCategory)[0]?.[0] ?? null,
  };

  const remembered = {};
  const prefix = `eshop:${message.id}`;

  const reply = await message.reply(
    shopView(state, prefix)
  );

  let updates = Promise.resolve();

  const collector = reply.createMessageComponentCollector({
    time: SHOP_TIMEOUT,
    filter: (interaction) =>
      (
        interaction.isButton() ||
        interaction.isStringSelectMenu()
      ) &&
      interaction.customId.startsWith(`${prefix}:`),
  });

  collector.on("collect", async (interaction) => {
    try {
      if (interaction.user.id !== message.author.id) {
        await notifyError(
          interaction,
          "These shop controls belong to another player. Use !shop."
        );
        return;
      }

      const suffix = interaction.customId.slice(
        prefix.length + 1
      );

      const buyingOne = suffix.startsWith("buyone:");
      const buyingMany = suffix.startsWith("buymany:");

      if (buyingOne || buyingMany) {
        const itemId = suffix.slice(suffix.indexOf(":") + 1);
        const item = ownItem(itemId);

        if (
          itemId !== state.selected ||
          !canBuy(item)
        ) {
          await notifyError(
            interaction,
            "That selection changed. Choose an item from the current shop panel."
          );
          return;
        }

        if (buyingMany) {
          await quantityModal(
            interaction,
            itemId,
            message.guildId,
            message.author.id
          );
        } else {
          await interaction.deferReply({
            flags: MessageFlags.Ephemeral,
          });

          await purchasePreview({
            guild: message.guildId,
            owner: message.author.id,
            itemId,
            quantity: 1,
            send: (data) => interaction.editReply(data),
            edit: (data) => interaction.editReply(data),
          });
        }

        return;
      }

      const navigation = [
        "category:weapon",
        "category:armor",
        "select",
        "previous",
        "next",
      ];

      if (!navigation.includes(suffix)) return;

      if (
        suffix === "select" &&
        !interaction.isStringSelectMenu()
      ) {
        return;
      }

      const acknowledgement = interaction
        .deferUpdate()
        .then(() => null, (error) => error);

      updates = updates
        .then(async () => {
          const ackError = await acknowledgement;
          if (ackError) throw ackError;

          if (suffix.startsWith("category:")) {
            remembered[state.category] = state.selected;

            state.category = suffix.slice(
              "category:".length
            );

            const entries = categoryItems(state.category);

            state.selected =
              entries.find(
                ([id]) => id === remembered[state.category]
              )?.[0] ??
              entries[0]?.[0] ??
              null;

            state.page = Math.max(
              0,
              Math.floor(
                entries.findIndex(
                  ([id]) => id === state.selected
                ) / ITEMS_PER_PAGE
              )
            );
          } else if (suffix === "select") {
            const entries = categoryItems(state.category);
            const selectedId = interaction.values[0];

            const visible = entries.slice(
              state.page * ITEMS_PER_PAGE,
              (state.page + 1) * ITEMS_PER_PAGE
            );

            if (
              !visible.some(([id]) => id === selectedId)
            ) {
              await notifyError(
                interaction,
                "That category or page changed. Select an item from the current dropdown."
              );
              return;
            }

            state.selected = selectedId;
          } else {
            const entries = categoryItems(state.category);
            const pages = Math.max(
              1,
              Math.ceil(entries.length / ITEMS_PER_PAGE)
            );

            state.page = Math.max(
              0,
              Math.min(
                pages - 1,
                state.page + (suffix === "next" ? 1 : -1)
              )
            );

            state.selected =
              entries[state.page * ITEMS_PER_PAGE]?.[0] ??
              null;
          }

          await reply.edit(
            shopView(state, prefix, collector.ended)
          );
        })
        .catch(async (error) => {
          console.error("Shop browser update failed:", error);

          await notifyError(
            interaction,
            "Could not update the shop. Use !shop to reopen it."
          );
        });
    } catch (error) {
      console.error("Shop action failed:", error);

      await notifyError(
        interaction,
        "The shop action could not complete. Use !shop to try again."
      );
    }
  });

  collector.on("end", () => {
    void updates
      .then(() =>
        reply.edit(shopView(state, prefix, true))
      )
      .catch(console.error);
  });
}

async function matchingItems(message, matches, quantity) {
  const prefix = `ematch:${message.id}`;
  const selectId = `${prefix}:pick`;
  const pages = Math.ceil(matches.length / ITEMS_PER_PAGE);
  const allowed = new Set(matches.map(([id]) => id));

  let page = 0;

  function view(expired = false) {
    const shown = matches.slice(
      page * ITEMS_PER_PAGE,
      (page + 1) * ITEMS_PER_PAGE
    );

    const menu = new StringSelectMenuBuilder()
      .setCustomId(selectId)
      .setPlaceholder("Choose the exact item you meant")
      .setDisabled(expired)
      .addOptions(
        shown.map(([id, item]) => ({
          label: item.name.slice(0, 100),
          description:
            `${money(item.price)} each • ${item.type}`.slice(0, 100),
          value: id,
        }))
      );

    const components = [row(menu)];

    if (pages > 1) {
      components.push(
        row(
          button(
            `${prefix}:previous`,
            "Previous matches",
            ButtonStyle.Secondary,
            expired || page === 0
          ),
          button(
            `${prefix}:next`,
            "Next matches",
            ButtonStyle.Secondary,
            expired || page === pages - 1
          )
        )
      );
    }

    return {
      content:
        `Found **${matches.length} matches**. ` +
        `Choose one to review a purchase of **${quantity}**. ` +
        `Page ${page + 1}/${pages}.`,
      components,
      allowedMentions: quiet,
    };
  }

  const reply = await message.reply(view());
  let edits = Promise.resolve();

  const collector = reply.createMessageComponentCollector({
    time: SHOP_TIMEOUT,
    filter: (interaction) =>
      (
        interaction.isButton() ||
        interaction.isStringSelectMenu()
      ) &&
      interaction.customId.startsWith(`${prefix}:`),
  });

  collector.on("collect", async (interaction) => {
    try {
      if (interaction.user.id !== message.author.id) {
        await notifyError(
          interaction,
          "Use !buy yourself to choose an item."
        );
        return;
      }

      if (
        interaction.customId === selectId &&
        interaction.isStringSelectMenu()
      ) {
        const itemId = interaction.values[0];

        if (!allowed.has(itemId)) {
          await notifyError(
            interaction,
            "That item is not one of the matches."
          );
          return;
        }

        collector.stop("selected");

        await interaction.deferReply({
          flags: MessageFlags.Ephemeral,
        });

        await edits;

        await reply.edit({
          content:
            "Item selected. Review your private purchase confirmation.",
          components: [],
          allowedMentions: quiet,
        }).catch(console.error);

        await purchasePreview({
          guild: message.guildId,
          owner: message.author.id,
          itemId,
          quantity,
          send: (data) => interaction.editReply(data),
          edit: (data) => interaction.editReply(data),
        });

        return;
      }

      if (
        ![
          `${prefix}:previous`,
          `${prefix}:next`,
        ].includes(interaction.customId)
      ) {
        return;
      }

      await interaction.deferUpdate();

      edits = edits
        .then(async () => {
          if (collector.ended) return;

          page = Math.max(
            0,
            Math.min(
              pages - 1,
              page +
              (
                interaction.customId === `${prefix}:next`
                  ? 1
                  : -1
              )
            )
          );

          await reply.edit(view());
        })
        .catch(console.error);
    } catch (error) {
      console.error("Item selection failed:", error);

      await notifyError(
        interaction,
        "The selection could not complete. Run !buy again."
      );
    }
  });

  collector.on("end", (_, reason) => {
    if (reason === "selected") return;

    void edits
      .then(() => reply.edit(view(true)))
      .catch(console.error);
  });
}

export async function buyCommand(message) {
  if (!message.inGuild() || message.author.bot) return;

  let parsed;

  try {
    parsed = parsePurchase(message.content);
  } catch (error) {
    await message.reply({
      content: error.message,
      allowedMentions: quiet,
    });
    return;
  }

  const matches = findItems(parsed.query);

  if (!matches.length) {
    await message.reply({
      content:
        "No matching item found. Check !shop or try part of the item's name.",
      allowedMentions: quiet,
    });
    return;
  }

  if (matches.length > 1) {
    await matchingItems(
      message,
      matches,
      parsed.quantity
    );
    return;
  }

  try {
    await purchasePreview({
      guild: message.guildId,
      owner: message.author.id,
      itemId: matches[0][0],
      quantity: parsed.quantity,
      send: (data) => message.reply(data),
    });
  } catch (error) {
    console.error("Purchase preview failed:", error);

    await message.reply({
      content:
        "Could not open the purchase confirmation. " +
        "Check your inventory before trying again.",
      allowedMentions: quiet,
    }).catch(console.error);
  }
}