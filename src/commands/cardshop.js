import { randomBytes } from "node:crypto";

import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
} from "discord.js";

import { cardShop } from "../database/cardShop.js";
import { economyConfig } from "../config/economy.js";
import { groupLabels } from "../config/cardShop.js";
import { CardShopError } from "../../services/cardShopStore.js";
import { renderCard } from "../cards/renderCard.js";
import { renderCardGrid } from "../cards/renderCardGrid.js";

const quiet = { parse: [], repliedUser: false };

const money = (amount) =>
  `${amount.toLocaleString("en-US")} ${economyConfig.currencyName}`;

const clean = (value, max = 80) =>
  String(value ?? "")
    .slice(0, max)
    .replace(/([\\`*_~|>])/g, "\\$1");

const cid = (user, action, target = "-", page = 0) =>
  `cs:${user}:${action}:${target}:${page}`;

function button(
  user,
  label,
  action,
  target = "-",
  page = 0,
  style = ButtonStyle.Secondary,
  disabled = false
) {
  return new ButtonBuilder()
    .setCustomId(cid(user, action, target, page))
    .setLabel(label)
    .setStyle(style)
    .setDisabled(disabled);
}

const row = (...buttons) =>
  new ActionRowBuilder().addComponents(buttons);

const payload = (embed, components = []) => ({
  embeds: [embed],
  components,
  allowedMentions: quiet,
  files: [],
});

const SHOP_PAGE_SIZE = 25;
const CONFIRM_MAX_AGE = 5 * 60 * 1000;
const consumedConfirmations = new Map();

const CATEGORIES = {
  all: "All Packs",
  ready: "Available",
  custom: "Custom Packs",
  sets: "Set Packs",
};

function slotText(slots) {
  return slots.map((weights, index) => {
    const total = Object.values(weights).reduce(
      (sum, weight) => sum + weight,
      0
    );

    const odds = Object.entries(weights).map(
      ([group, weight]) =>
        `${groupLabels[group] ?? group} ` +
        `${((weight / total) * 100).toFixed(1)}%`
    );

    return `**${index + 1}.** ${odds.join(" / ")}`;
  }).join("\n");
}

function categoryOffers(offers, category) {
  return offers
    .filter((pack) =>
      category === "all" ||
      (category === "ready" && pack.ready) ||
      (category === "custom" && !pack.id.startsWith("set-")) ||
      (category === "sets" && pack.id.startsWith("set-"))
    )
    .sort(
      (a, b) =>
        a.price - b.price ||
        a.name.localeCompare(b.name)
    );
}

async function shopView(user, page = 0, target = "-") {
  const offers = await cardShop.offers();
  let [category, selectedId] = String(target).split("~");

  if (!Object.hasOwn(CATEGORIES, category)) {
    category = offers.some((pack) => pack.ready)
      ? "ready"
      : "all";
  }

  const entries = categoryOffers(offers, category);

  const selectedIndex = entries.findIndex(
    (pack) => pack.id === selectedId
  );

  const pages = Math.max(
    1,
    Math.ceil(entries.length / SHOP_PAGE_SIZE)
  );

  page = selectedIndex >= 0
    ? Math.floor(selectedIndex / SHOP_PAGE_SIZE)
    : Math.max(0, Math.min(page, pages - 1));

  const shown = entries.slice(
    page * SHOP_PAGE_SIZE,
    (page + 1) * SHOP_PAGE_SIZE
  );

  const pack = selectedIndex >= 0
    ? entries[selectedIndex]
    : shown[0];

  const embed = new EmbedBuilder()
    .setTitle(
      pack
        ? `🎴 ${clean(pack.name, 100)}`
        : "🎴 Millie's Card Shop"
    )
    .setColor(pack?.color ?? 0x63acff)
    .setDescription(
      pack
        ? clean(pack.description, 700)
        : "No packs in this category. Choose another category below."
    );

  if (pack) {
    embed.addFields(
      {
        name: "Price (per pack)",
        value: `**${money(pack.price)}**`,
        inline: true,
      },
      {
        name: "Sell-back (per pack)",
        value: `**${money(pack.sellPrice)}**`,
        inline: true,
      },
      {
        name: "Slot odds",
        value: slotText(pack.slots).slice(0, 1024),
      },
      {
        name: "Source sets",
        value:
          clean(pack.setIds.join(", "), 900) ||
          "Not specified",
      },
      {
        name: "Availability",
        value: pack.ready
          ? "✅ Ready to purchase"
          : `⏳ ${clean(
            pack.reason || "Catalog import required.",
            300
          )}`,
      }
    );
  }

  embed.setFooter({
    text:
      `${CATEGORIES[category]} • ${entries.length} packs • ` +
      `Page ${page + 1}/${pages} • Custom virtual odds`,
  });

  const components = [
    row(
      ...Object.entries(CATEGORIES).map(([key, label]) =>
        button(
          user,
          label,
          "shop",
          key,
          0,
          ButtonStyle.Primary,
          key === category
        )
      )
    ),
  ];

  if (shown.length) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(cid(user, "shopselect", category, page))
      .setPlaceholder("Choose a card pack")
      .addOptions(
        shown.map((offer) => ({
          label: offer.name.slice(0, 100),
          value: offer.id,
          description:
            `${money(offer.price)} • ` +
            `${offer.ready ? "Available" : "Unavailable"}`,
          default: offer.id === pack?.id,
        })).map((option) => ({
          ...option,
          description: option.description.slice(0, 100),
        }))
      );

    components.push(row(menu));
  }

  if (pages > 1) {
    components.push(
      row(
        button(
          user, "Previous packs", "shop", category,
          page - 1, ButtonStyle.Secondary, page === 0
        ),
        button(
          user, "Next packs", "shop", category,
          page + 1, ButtonStyle.Secondary, page === pages - 1
        )
      )
    );
  }

  if (pack) {
    components.push(
      row(
        ...[1, 5, 10].map((quantity) =>
          button(
            user,
            `Buy ${quantity}`,
            "buy",
            `${pack.id}~${pack.quote ?? "unavailable"}~${quantity}`,
            0,
            ButtonStyle.Success,
            !pack.ready
          )
        )
      )
    );
  }

  components.push(
    row(
      button(user, "My packs", "packs"),
      button(user, "My cards", "cards")
    )
  );

  return payload(embed, components);
}

function purchaseDetails(target) {
  const parts = String(target).split("~");
  const [offerId, quote, quantityText = "1", token] = parts;
  const quantity = Number(quantityText);

  if (
    parts.length < 2 ||
    parts.length > 4 ||
    !offerId ||
    !quote ||
    quote === "unavailable" ||
    ![1, 5, 10].includes(quantity)
  ) {
    throw new CardShopError(
      "Refresh !cardshop and choose 1, 5, or 10 packs."
    );
  }

  if (
    token &&
    !/^[a-z0-9]{8,12}\.[a-f0-9]{8}$/.test(token)
  ) {
    throw new CardShopError(
      "Invalid confirmation. Refresh !cardshop."
    );
  }

  return { offerId, quote, quantity, token };
}

async function purchaseView(user, target) {
  const { offerId, quote, quantity } = purchaseDetails(target);

  const pack = (await cardShop.offers()).find(
    (offer) => offer.id === offerId
  );

  if (!pack?.ready || pack.quote !== quote) {
    throw new CardShopError(
      "This offer changed. Refresh !cardshop before buying."
    );
  }

  const total = pack.price * quantity;

  if (!Number.isSafeInteger(total) || total < 1) {
    throw new CardShopError("Invalid purchase total.");
  }

  const token =
    `${Date.now().toString(36)}.${randomBytes(4).toString("hex")}`;

  const confirmationTarget =
    `${offerId}~${quote}~${quantity}~${token}`;

  const embed = new EmbedBuilder()
    .setTitle("Confirm Pack Purchase")
    .setColor(pack.color ?? 0x63acff)
    .setDescription(
      `**${quantity} × ${clean(pack.name)}**\n\n` +
      `Unit price: **${money(pack.price)}**\n` +
      `Total: **${money(total)}**\n` +
      `Cards: **${pack.slots.length * quantity}**\n\n` +
      "Confirm within 5 minutes, or cancel."
    );

  return payload(embed, [
    row(
      button(
        user, "Confirm purchase", "confirmbuy",
        confirmationTarget, 0, ButtonStyle.Success
      ),
      button(
        user, "Cancel", "cancelbuy",
        token, 0, ButtonStyle.Danger
      )
    ),
  ]);
}

async function packsView(guild, user, page = 0) {
  const inventory = await cardShop.listPacks(guild, user, page);

  const embed = new EmbedBuilder()
    .setTitle("🎒 Your Unopened Packs")
    .setColor(0x39c995)
    .setDescription(
      inventory.total
        ? inventory.rows.map((pack, index) =>
          `**${index + 1}. ${clean(pack.snapshot.name)}** — ` +
          `sell for ${money(pack.snapshot.sellPrice)}`
        ).join("\n")
        : "You don't have any unopened packs. Visit `!cardshop`."
    )
    .setFooter({
      text:
        `${inventory.total} unopened • ` +
        `Page ${inventory.page + 1}/${inventory.pages}`,
    });

  const components = [];

  if (inventory.rows.length) {
    components.push(
      row(
        new StringSelectMenuBuilder()
          .setCustomId(cid(user, "pick"))
          .setPlaceholder("Select a pack to open or sell")
          .addOptions(
            inventory.rows.map((pack, index) => ({
              label:
                `${index + 1}. ${pack.snapshot.name}`.slice(0, 100),
              description:
                `${pack.snapshot.slots.length} cards • ` +
                `Sell for ${money(pack.snapshot.sellPrice)}`,
              value: pack.id,
            })).map((option) => ({
              ...option,
              description: option.description.slice(0, 100),
            }))
          )
      )
    );
  }

  components.push(
    row(
      button(
        user, "Previous", "packs", "-",
        inventory.page - 1, ButtonStyle.Secondary,
        inventory.page === 0
      ),
      button(
        user, "Next", "packs", "-",
        inventory.page + 1, ButtonStyle.Secondary,
        inventory.page === inventory.pages - 1
      ),
      button(user, "Shop", "shop"),
      button(user, "My cards", "cards")
    )
  );

  return payload(embed, components);
}

async function packView(guild, user, id) {
  const { owned, count } = await cardShop.packGroup(guild, user, id);
  const pack = owned.snapshot;

  const embed = new EmbedBuilder()
    .setTitle(`📦 ${pack.name}`)
    .setColor(pack.color ?? 0x39c995)
    .setDescription(
      `Opening consumes this pack and saves **${pack.slots.length} cards**.\n` +
      `You own **${count}** unopened packs of this type.\n` +
      "Open All opens only this type. Each pack keeps its own saved odds.\n" +
      `Sell this one unopened pack for **${money(pack.sellPrice)}**.`
    )
    .addFields({
      name: "Saved slot odds",
      value: slotText(pack.slots),
    })
    .setFooter({
      text: `Pack ${id.slice(0, 8)} • Odds were locked at purchase`,
    });

  return payload(embed, [
    row(
      button(user, "Open 1", "open", id, 0, ButtonStyle.Success),
      button(
        user, "Open 5", "open", `${id}~5`,
        0, ButtonStyle.Success, count < 5
      ),
      button(
        user, "Open 10", "open", `${id}~10`,
        0, ButtonStyle.Success, count < 10
      ),
      button(
        user, `Open all (${count})`, "open",
        `${id}~all`, 0, ButtonStyle.Success
      )
    ),
    row(
      button(
        user,
        `Sell 1 · ${pack.sellPrice.toLocaleString("en-US")}`,
        "sell",
        id,
        0,
        ButtonStyle.Danger
      ),
      button(user, "My packs", "packs")
    ),
  ]);
}

const OPENING_PAGE_SIZE = 50;
const VIEW_CACHE_TTL = 5 * 60 * 1000;
const VIEW_CACHE_MAX_BYTES = 32 * 1024 * 1024;

const viewCache = new Map();
const pendingViews = new Map();

let viewCacheBytes = 0;

const panelRevisions = new Map();
const panelUpdates = new Map();
let nextPanelRevision = 0;

async function cachedView(key, load) {
  const now = Date.now();

  for (const [entryKey, entry] of viewCache) {
    if (entry.expires <= now) {
      viewCacheBytes -= entry.bytes;
      viewCache.delete(entryKey);
    }
  }

  const old = viewCache.get(key);

  if (old) {
    viewCache.delete(key);
    viewCache.set(key, old);
    return old.value;
  }

  if (pendingViews.has(key)) {
    return pendingViews.get(key);
  }

  const task = (async () => {
    const value = await load();

    const bytes = ArrayBuffer.isView(value)
      ? value.byteLength
      : value?.image?.byteLength ??
      Buffer.byteLength(JSON.stringify(value));

    if (bytes <= VIEW_CACHE_MAX_BYTES) {
      while (
        viewCache.size &&
        (
          viewCacheBytes + bytes > VIEW_CACHE_MAX_BYTES ||
          viewCache.size >= 100
        )
      ) {
        const oldest = viewCache.keys().next().value;

        viewCacheBytes -= viewCache.get(oldest).bytes;
        viewCache.delete(oldest);
      }

      viewCache.set(key, {
        value,
        bytes,
        expires: Date.now() + VIEW_CACHE_TTL,
      });

      viewCacheBytes += bytes;
    }

    return value;
  })();

  pendingViews.set(key, task);

  try {
    return await task;
  } finally {
    pendingViews.delete(key);
  }
}

async function editPanel(interaction, revision, data) {
  const key = interaction.message.id;
  const previous = panelUpdates.get(key) ?? Promise.resolve();

  const task = previous.catch(() => { }).then(async () => {
    if (panelRevisions.get(key) === revision) {
      await interaction.editReply(data);
    }
  });

  panelUpdates.set(key, task);

  try {
    await task;
  } finally {
    if (panelUpdates.get(key) === task) {
      panelUpdates.delete(key);
    }
  }
}

async function readOpening(guild, user, id) {
  const opened = await cachedView(
    `opening:${guild}:${user}:${id}`,
    () => cardShop.opening(guild, user, id)
  );

  if (
    !Array.isArray(opened.cards) ||
    !opened.cards.length
  ) {
    throw new CardShopError(
      "This opening has no cards to display."
    );
  }

  return opened;
}

function openingParts(target) {
  const [id, mode = "list"] = String(target).split("~");

  if (!id || !["list", "grid"].includes(mode)) {
    throw new CardShopError(
      "Refresh !packs to view this opening."
    );
  }

  return { id, mode };
}

async function attachCard(data, item) {
  try {
    const png = await cachedView(
      `card:${item.copyId}`,
      () => renderCard(item.card, item.copyId)
    );

    data.files = [
      new AttachmentBuilder(png, { name: "card.png" }),
    ];

    data.embeds[0].setImage("attachment://card.png");
  } catch (error) {
    console.error(
      "Card render failed; keeping awarded card:",
      error
    );

    data.embeds[0].addFields({
      name: "Image unavailable",
      value: "Your card is saved. View it again with !cards.",
    });
  }

  return data;
}

async function openingView(
  guild,
  user,
  openingId,
  page = 0,
  mode = "list"
) {
  const opened = await readOpening(guild, user, openingId);

  const pages = Math.max(
    1,
    Math.ceil(opened.cards.length / OPENING_PAGE_SIZE)
  );

  page = Number.isSafeInteger(page)
    ? Math.max(0, Math.min(page, pages - 1))
    : 0;

  const start = page * OPENING_PAGE_SIZE;

  const shown = opened.cards.slice(
    start,
    start + OPENING_PAGE_SIZE
  );

  const short = (value, max) =>
    clean(value, max).slice(0, max).replace(/\\$/, "");

  const summary = shown.map((pull, index) =>
    `\`${start + index + 1}.\` ` +
    `${short(pull.card.name, 32)} • ` +
    short(pull.card.rarity, 18)
  ).join("\n");

  const embed = new EmbedBuilder()
    .setTitle(
      `✨ ${clean(opened.name, 100)} • Opening Results`
    )
    .setColor(0xf4bd51)
    .setDescription(
      `Opened **${opened.quantity ?? 1} pack(s)** and saved ` +
      `**${opened.cards.length} cards**.\n` +
      `Showing **${start + 1}–${start + shown.length}**. ` +
      "Select a card below for its full image.\n\n" +
      (
        mode === "grid"
          ? "Numbered images match the dropdowns below."
          : summary
      )
    )
    .setFooter({
      text:
        `Page ${page + 1}/${pages} • 50 pulls per page • ` +
        "All cards are already saved",
    });

  const components = [];

  for (let offset = 0; offset < shown.length; offset += 25) {
    const choices = shown.slice(offset, offset + 25);

    components.push(
      row(
        new StringSelectMenuBuilder()
          .setCustomId(
            cid(
              user,
              offset === 0 ? "openpick" : "openpick2",
              `${openingId}~${mode}`,
              page
            )
          )
          .setPlaceholder(
            `Inspect pull ${start + offset + 1}–` +
            `${start + offset + choices.length}`
          )
          .addOptions(
            choices.map((pull, index) => ({
              label:
                `${start + offset + index + 1}. ` +
                pull.card.name,
              description:
                `${pull.card.rarity} • ` +
                `${pull.card.set?.name ?? "Unknown set"}`,
              value: String(start + offset + index),
            })).map((option) => ({
              ...option,
              label: option.label.slice(0, 100),
              description: option.description.slice(0, 100),
            }))
          )
      )
    );
  }

  if (pages > 1) {
    const firstJump = Math.floor(page / 25) * 25;

    components.push(
      row(
        new StringSelectMenuBuilder()
          .setCustomId(
            cid(user, "openjump", `${openingId}~${mode}`, page)
          )
          .setPlaceholder("Jump to a results page")
          .addOptions(
            Array.from(
              { length: Math.min(25, pages - firstJump) },
              (_, index) => {
                const destination = firstJump + index;

                return {
                  label:
                    `Page ${destination + 1} • pulls ` +
                    `${destination * 50 + 1}–` +
                    Math.min(
                      opened.cards.length,
                      (destination + 1) * 50
                    ),
                  value: String(destination),
                  default: destination === page,
                };
              }
            )
          )
      )
    );
  }

  const action = mode === "grid" ? "opengrid" : "openlist";

  components.push(
    row(
      button(
        user, "Previous 50", action, openingId,
        page - 1, ButtonStyle.Secondary, page === 0
      ),
      button(
        user, "Next 50", action, openingId,
        page + 1, ButtonStyle.Secondary, page === pages - 1
      ),
      button(
        user,
        mode === "grid" ? "Fast list" : "Grid view",
        mode === "grid" ? "openlist" : "opengrid",
        openingId,
        page,
        ButtonStyle.Primary
      ),
      button(user, "My packs", "packs"),
      button(user, "My cards", "cards")
    )
  );

  if (pages > 1) {
    components.push(
      row(
        button(
          user, "First page", action, openingId,
          0, ButtonStyle.Secondary, page === 0
        ),
        button(
          user, "Last page", action, openingId,
          pages - 1, ButtonStyle.Secondary,
          page === pages - 1
        ),
        button(user, "Shop", "shop")
      )
    );
  }

  const data = payload(embed, components);

  if (mode === "grid") {
    try {
      const grid = await cachedView(
        `grid:${guild}:${user}:${openingId}:${page}`,
        () => renderCardGrid(shown, {
          startNumber: start + 1,
        })
      );

      data.files = [
        new AttachmentBuilder(grid.image, {
          name: "opening.jpg",
        }),
      ];

      embed.setImage("attachment://opening.jpg");

      if (grid.missing) {
        embed.addFields({
          name: "Some artwork is unavailable",
          value:
            `${grid.missing} thumbnail(s) could not load. ` +
            "Use the dropdowns to inspect cards.",
        });
      }
    } catch (error) {
      console.error("Opening grid failed:", error);

      embed.setDescription(
        `Your **${opened.cards.length} cards** are saved. ` +
        `Showing pulls **${start + 1}–${start + shown.length}**.` +
        `\n\n${summary}`
      );

      embed.addFields({
        name: "Grid unavailable",
        value:
          "Use Fast list or select an individual card. " +
          "No packs were reopened.",
      });
    }
  }

  return data;
}

async function openingCardView(
  guild,
  user,
  openingId,
  index = 0,
  mode = "list"
) {
  const opened = await readOpening(guild, user, openingId);

  index = Number.isSafeInteger(index)
    ? Math.max(0, Math.min(index, opened.cards.length - 1))
    : 0;

  const item = opened.cards[index];

  const embed = new EmbedBuilder()
    .setTitle(`🃏 ${clean(item.card.name, 100)}`)
    .setColor(0x63acff)
    .setDescription(
      `**${clean(item.card.rarity)}** • ` +
      `${clean(item.card.set?.name)}\n` +
      `Copy ID: \`${item.copyId}\``
    )
    .setFooter({
      text:
        `Pull ${index + 1}/${opened.cards.length} • ` +
        "Select Back to results to browse 50 at once",
    });

  return attachCard(
    payload(embed, [
      row(
        button(
          user, "Previous card", "reveal",
          `${openingId}~${mode}`, index - 1,
          ButtonStyle.Secondary, index === 0
        ),
        button(
          user, "Next card", "reveal",
          `${openingId}~${mode}`, index + 1,
          ButtonStyle.Secondary,
          index === opened.cards.length - 1
        ),
        button(
          user,
          "Back to results",
          mode === "grid" ? "opengrid" : "openlist",
          openingId,
          Math.floor(index / 50),
          ButtonStyle.Primary
        ),
        button(user, "My packs", "packs"),
        button(user, "My cards", "cards")
      ),
    ]),
    item
  );
}

async function cardsView(guild, user, page = 0) {
  const collection = await cardShop.listCards(guild, user, page);

  const first = collection.page * collection.pageSize + 1;
  const last = first + collection.items.length - 1;

  const embed = new EmbedBuilder()
    .setTitle("🃏 Your Card Collection")
    .setColor(0x63acff)
    .setDescription(
      collection.total
        ? `Showing **${first}–${last}** of **${collection.total}** cards.\n` +
        "Select a numbered card below to see its full image and Copy ID."
        : "No cards yet. Open a pack with `!packs`."
    )
    .setFooter({
      text:
        `Page ${collection.page + 1}/${collection.pages} • ` +
        "Up to 50 cards per page",
    });

  const components = [];

  for (
    let offset = 0;
    offset < collection.items.length;
    offset += 25
  ) {
    const choices = collection.items.slice(offset, offset + 25);

    components.push(
      row(
        new StringSelectMenuBuilder()
          .setCustomId(
            cid(
              user,
              "cardpick",
              String(offset / 25),
              collection.page
            )
          )
          .setPlaceholder(
            `View card ${first + offset}–` +
            `${first + offset + choices.length - 1}`
          )
          .addOptions(
            choices.map((item, index) => ({
              label:
                `${first + offset + index}. ${item.card.name}`.slice(0, 100),
              description:
                `${item.card.rarity} • ` +
                `${item.card.set?.name ?? "Unknown set"} • ` +
                item.copyId.slice(0, 8),
              value: item.copyId,
            })).map((option) => ({
              ...option,
              description: option.description.slice(0, 100),
            }))
          )
      )
    );
  }

  components.push(
    row(
      button(
        user, "Previous page", "cards", "-",
        collection.page - 1, ButtonStyle.Secondary,
        collection.page === 0
      ),
      button(
        user, "Next page", "cards", "-",
        collection.page + 1, ButtonStyle.Secondary,
        collection.page === collection.pages - 1
      ),
      button(user, "My packs", "packs"),
      button(user, "Shop", "shop")
    )
  );

  const data = payload(embed, components);

  if (collection.items.length) {
    try {
      const grid = await renderCardGrid(collection.items, {
        startNumber: first,
      });

      data.files = [
        new AttachmentBuilder(grid.image, {
          name: "collection.jpg",
        }),
      ];

      embed.setImage("attachment://collection.jpg");

      if (grid.missing) {
        embed.addFields({
          name: "Some artwork is unavailable",
          value:
            `${grid.missing} thumbnail(s) could not load. ` +
            "The numbered cards are still selectable below.",
        });
      }
    } catch (error) {
      console.error("Collection grid failed:", error);

      embed.addFields({
        name: "Grid unavailable",
        value:
          "Use the dropdowns to view individual cards. " +
          "Your collection is saved.",
      });
    }
  }

  return data;
}

async function singleCardView(
  guild,
  user,
  copyId,
  collectionPage = 0
) {
  const item = await cardShop.ownedCard(guild, user, copyId);

  const embed = new EmbedBuilder()
    .setTitle(`🃏 ${clean(item.card.name)}`)
    .setColor(0x63acff)
    .setDescription(
      `**${clean(item.card.rarity)}** • ` +
      `${clean(item.card.set?.name)}\n` +
      `Copy ID: \`${item.copyId}\``
    )
    .setFooter({
      text: "Select Back to collection to return to your 50-card page",
    });

  return attachCard(
    payload(embed, [
      row(
        button(
          user, "Back to collection",
          "cards", "-", collectionPage
        ),
        button(user, "My packs", "packs"),
        button(user, "Shop", "shop")
      ),
    ]),
    item
  );
}

export async function cardShopCommand(message) {
  if (!message.inGuild() || message.author.bot) return;

  await message.reply(
    await shopView(message.author.id)
  );
}

export async function packsCommand(message) {
  if (!message.inGuild() || message.author.bot) return;

  await message.reply(
    await packsView(message.guildId, message.author.id)
  );
}

export async function cardsCommand(message) {
  if (!message.inGuild() || message.author.bot) return;

  const loading = await message.reply({
    content: "Loading your card collection…",
    allowedMentions: quiet,
  });

  try {
    await loading.edit({
      ...await cardsView(message.guildId, message.author.id),
      content: null,
      attachments: [],
    });
  } catch (error) {
    console.error("Collection failed:", error);

    await loading.edit({
      content: "Could not load your collection. Try !cards again.",
      embeds: [],
      components: [],
    });
  }
}

export async function handleCardShopInteraction(interaction) {
  if (
    !interaction.isMessageComponent() ||
    !interaction.customId.startsWith("cs:")
  ) {
    return false;
  }

  const parts = interaction.customId.split(":");
  const [, owner, action, target, pageText] = parts;

  if (
    !interaction.inGuild() ||
    interaction.user.id !== owner
  ) {
    await interaction.reply({
      content:
        "These controls belong to another player. " +
        "Run !cardshop or !packs yourself.",
      flags: MessageFlags.Ephemeral,
    });

    return true;
  }

  const page = /^-?\d+$/.test(pageText ?? "")
    ? Number(pageText)
    : 0;

  if (
    parts.length !== 5 ||
    !Number.isSafeInteger(page) ||
    Math.abs(page) > 1_000_000
  ) {
    await interaction.reply({
      content: "Invalid card shop control. Run !cardshop again.",
      flags: MessageFlags.Ephemeral,
    });

    return true;
  }

  if (action === "confirmbuy" || action === "cancelbuy") {
    const now = Date.now();

    for (const [key, until] of consumedConfirmations) {
      if (until <= now) consumedConfirmations.delete(key);
    }

    const token = action === "confirmbuy"
      ? String(target).split("~")[3]
      : target === "-"
        ? null
        : target;

    if (
      token &&
      !/^[a-z0-9]{8,12}\.[a-f0-9]{8}$/.test(token)
    ) {
      await interaction.reply({
        content: "Invalid confirmation. Refresh !cardshop.",
        flags: MessageFlags.Ephemeral,
      });

      return true;
    }

    const key = token ?? interaction.message.id;

    if (consumedConfirmations.has(key)) {
      await interaction.deferUpdate();
      return true;
    }

    const createdAt = token
      ? parseInt(token.split(".")[0], 36)
      : interaction.message.createdTimestamp;

    if (
      action === "confirmbuy" &&
      createdAt &&
      now - createdAt > CONFIRM_MAX_AGE
    ) {
      await interaction.update({
        content:
          "Purchase confirmation expired. " +
          "Open !cardshop for a new quote.",
        embeds: [],
        components: [],
        attachments: [],
        allowedMentions: quiet,
      });

      return true;
    }

    consumedConfirmations.set(key, now + 15 * 60 * 1000);
  }

  const panelKey = interaction.message.id;
  const revision = ++nextPanelRevision;

  panelRevisions.set(panelKey, revision);

  if (panelRevisions.size > 1000) {
    panelRevisions.delete(
      panelRevisions.keys().next().value
    );
  }

  // Every action updates the existing message.
  await interaction.deferUpdate();

  const guild = interaction.guildId;
  const user = interaction.user.id;
  let committed = false;

  try {
    let data;

    if (action === "shop") {
      data = await shopView(user, page, target);
    } else if (
      action === "shopselect" &&
      interaction.isStringSelectMenu()
    ) {
      if (!Object.hasOwn(CATEGORIES, target)) {
        throw new CardShopError(
          "Refresh !cardshop to choose a category."
        );
      }

      data = await shopView(
        user,
        page,
        `${target}~${interaction.values[0]}`
      );
    } else if (action === "cancelbuy") {
      data = payload(
        new EmbedBuilder()
          .setTitle("Purchase canceled")
          .setColor(0x95a5a6)
          .setDescription(
            "No currency was spent. Your shop browser is still available."
          ),
        [
          row(
            button(user, "Shop", "shop"),
            button(user, "My packs", "packs")
          ),
        ]
      );
    } else if (action === "packs") {
      data = await packsView(guild, user, page);
    } else if (
      action === "pick" &&
      interaction.isStringSelectMenu()
    ) {
      data = await packView(
        guild,
        user,
        interaction.values[0]
      );
    } else if (action === "cards") {
      data = await cardsView(guild, user, page);
    } else if (
      action === "cardpick" &&
      interaction.isStringSelectMenu()
    ) {
      data = await singleCardView(
        guild,
        user,
        interaction.values[0],
        page
      );
    } else if (
      action === "openlist" ||
      action === "opengrid"
    ) {
      data = await openingView(
        guild,
        user,
        target,
        page,
        action === "opengrid" ? "grid" : "list"
      );
    } else if (
      ["openpick", "openpick2", "openjump"].includes(action) &&
      interaction.isStringSelectMenu()
    ) {
      const { id, mode } = openingParts(target);
      const value = interaction.values[0];

      if (
        !/^\d+$/.test(value ?? "") ||
        !Number.isSafeInteger(Number(value))
      ) {
        throw new CardShopError(
          "Invalid results selection."
        );
      }

      data = action === "openjump"
        ? await openingView(
          guild, user, id, Number(value), mode
        )
        : await openingCardView(
          guild, user, id, Number(value), mode
        );
    } else if (action === "reveal") {
      const { id, mode } = openingParts(target);

      data = await openingCardView(
        guild,
        user,
        id,
        page,
        mode
      );
    } else if (action === "buy") {
      data = await purchaseView(user, target);
    } else if (action === "confirmbuy") {
      const { offerId, quote, quantity, token } =
        purchaseDetails(target);

      const requestId =
        `cardshop:purchase:${token ?? interaction.message.id}`;

      const receipt = await cardShop.buy(
        guild,
        user,
        offerId,
        requestId,
        quote,
        quantity
      );

      committed = true;

      data = await packView(guild, user, receipt.packId);

      const details = data.embeds[0].data.description;

      data.embeds[0].setDescription(
        `✅ Bought **${quantity} × ${clean(receipt.name)}** ` +
        `for **${money(receipt.price)}**.\n` +
        `Balance: **${money(receipt.balance)}**.\n\n` +
        details
      );
    } else if (action === "open") {
      const [packId, countText = "1"] = target.split("~");

      const quantity = countText === "all"
        ? "all"
        : Number(countText);

      await cardShop.openMany(
        guild,
        user,
        packId,
        interaction.id,
        quantity
      );

      committed = true;

      data = await openingView(
        guild,
        user,
        interaction.id
      );
    } else if (action === "sell") {
      const receipt = await cardShop.sell(
        guild,
        user,
        target,
        interaction.id
      );

      committed = true;

      data = payload(
        new EmbedBuilder()
          .setTitle("💰 Pack Sold")
          .setColor(0x39c995)
          .setDescription(
            `Sold **${receipt.name}** ` +
            `for **${money(receipt.price)}**.\n` +
            `Balance: **${money(receipt.balance)}**.`
          ),
        [
          row(
            button(user, "My packs", "packs"),
            button(user, "Shop", "shop")
          ),
        ]
      );
    } else {
      throw new CardShopError(
        "Unknown control. Run !cardshop again."
      );
    }

    // Ignore older renders if the player has navigated elsewhere.
    if (panelRevisions.get(panelKey) !== revision) {
      return true;
    }

    await editPanel(interaction, revision, {
      ...data,
      content: null,
      attachments: [],
    });
  } catch (error) {
    console.error("Cardshop interaction failed:", error);

    if (panelRevisions.get(panelKey) !== revision) {
      return true;
    }

    const text = committed
      ? "The action completed, but the display failed. " +
      "Check !packs or !cards. It was not repeated or refunded."
      : error instanceof CardShopError
        ? error.message
        : "The action failed. Refresh !packs or check the bot log.";

    await editPanel(interaction, revision, {
      content: text,
      embeds: [],
      components: [],
      attachments: [],
    }).catch(console.error);
  }

  return true;
}