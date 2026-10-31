import { createHash, randomUUID } from "node:crypto";
import { packDefinitions } from "../src/config/cardShop.js";
import {
  CARD_GROUPS,
  validateOffer,
  chooseCards,
} from "./cardPackLogic.js";

export class CardShopError extends Error { }
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fail = (message) => { throw new CardShopError(message); };
const MAX_BALANCE = Number.MAX_SAFE_INTEGER;
const GROUPS = CARD_GROUPS;

// Preserve the existing four database bucket values.
// Detailed pools are built from the separate rarity column.
function legacyBucket(rarity) {
  const value = String(rarity ?? "").trim().toLowerCase();

  return ["common", "uncommon", "rare"].includes(value)
    ? value
    : "special";
}

const RARITY_POOLS = {
  "common": "common",
  "uncommon": "uncommon",
  "rare": "rare",

  "holo rare": "holo_rare",
  "rare holo": "holo_rare",
  "double rare": "double_rare",
  "ultra rare": "ultra_rare",
  "illustration rare": "illustration_rare",
  "special illustration rare": "special_illustration_rare",
  "hyper rare": "hyper_rare",
  "ace spec rare": "ace_spec_rare",

  "secret rare": "secret_rare",
  "radiant rare": "radiant_rare",
  "amazing rare": "amazing_rare",
  "shiny rare": "shiny_rare",
  "shiny ultra rare": "shiny_ultra_rare",
  "holo rare v": "holo_rare_v",
  "holo rare vmax": "holo_rare_vmax",
  "holo rare vstar": "holo_rare_vstar",
  "full art trainer": "full_art_trainer",
};

function poolForRarity(rarity) {
  const value = String(rarity ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  return Object.hasOwn(RARITY_POOLS, value)
    ? RARITY_POOLS[value]
    : "special";
}

function number(value, name) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) fail(`Invalid ${name}.`);
  return result;
}

const decodePack = (row) => ({
  ...row,
  bought_at: number(row.bought_at, "purchase timestamp"),
  snapshot: JSON.parse(row.snapshot),
});

export function createCardShopStore(db, definitions = packDefinitions, rng) {
  async function transaction(fn, readOnly = false) {
    const client = await db.connect();
    try {
      await client.query(readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); }
      catch (rollbackError) { console.error("Card shop rollback failed:", rollbackError); }
      throw error;
    } finally {
      client.release();
    }
  }

  async function advisoryLock(client, namespace, id) {
    const key = createHash("sha256").update(`${namespace}:${id}`)
      .digest().readBigInt64BE(0).toString();
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [key]);
  }

  async function initialize() {
    // Create tables separately by running cardshop.sql in Supabase.
    if (!Array.isArray(definitions)) fail("Invalid pack definitions.");
    for (const offer of definitions) validateOffer(offer);
    if (new Set(definitions.map((offer) => offer.id)).size !== definitions.length) {
      fail("Pack IDs must be unique.");
    }
    await db.query("SELECT guild_id, user_id, balance FROM public.accounts LIMIT 0");
    await db.query("SELECT card_key, api_id, set_id, rarity, bucket, payload, active FROM public.card_catalog LIMIT 0");
    await db.query("SELECT id, guild_id, user_id, snapshot, state, bought_at FROM public.card_packs LIMIT 0");
    await db.query("SELECT id, guild_id, user_id, card_key, pack_id, acquired_at FROM public.card_owned LIMIT 0");
    await db.query("SELECT id, guild_id, user_id, kind, target, result, created_at FROM public.card_actions LIMIT 0");
  }

  // Immutable metadata keys preserve cards referenced by older pack snapshots.
  async function importSet(setId, cards) {
    if (typeof setId !== "string" || !setId) fail("Invalid source set.");
    if (!Array.isArray(cards) || !cards.length) fail("Cannot import an empty set.");
    if (cards.some((card) => !card || typeof card !== "object")) fail("Invalid card data.");
    if (new Set(cards.map((card) => card.id)).size !== cards.length) {
      fail("Duplicate API card IDs in set import.");
    }
    const prepared = cards.map((card) => {
      if (typeof card.id !== "string" || !card.id || !card.name ||
        card.set?.id !== setId || !card.image || !card.rarity) {
        fail(`Incomplete card: ${card.id ?? "unknown"}. No catalog changes made.`);
      }
      const payload = JSON.stringify(card);
      const bucket = legacyBucket(card.rarity);
      if (!GROUPS.includes(bucket)) fail("Invalid rarity group.");
      return { key: hash(payload), card, payload, bucket };
    });
    return transaction(async (client) => {
      // Prevent simultaneous imports of one set from mixing active revisions.
      await advisoryLock(client, "cardshop:catalog", setId);
      await client.query("UPDATE public.card_catalog SET active = 0 WHERE set_id = $1", [setId]);
      for (const row of prepared) {
        await client.query(
          `INSERT INTO public.card_catalog
           (card_key, api_id, set_id, rarity, bucket, payload, active)
           VALUES ($1, $2, $3, $4, $5, $6, 1)
           ON CONFLICT (card_key) DO UPDATE SET active = 1`,
          [row.key, row.card.id, setId, row.card.rarity, row.bucket, row.payload]
        );
      }
      return prepared.length;
    });
  }

  async function snapshotOffer(client, offer) {
    validateOffer(offer);
    // One query sees one committed catalog revision across all source sets.
    const setIds = [...new Set(offer.setIds)];
    const { rows } = await client.query(
      `SELECT card_key, set_id, bucket, rarity FROM public.card_catalog
       WHERE set_id = ANY($1::text[]) AND active = 1
       ORDER BY api_id, card_key`, [setIds]
    );
    return snapshotFromCatalog(offer, indexCatalog(rows));
  }

  function indexCatalog(rows) {
    const index = new Map();
    for (const row of rows) {
      if (!index.has(row.set_id)) index.set(row.set_id, []);
      index.get(row.set_id).push(row);
    }
    return index;
  }

  function snapshotFromCatalog(offer, index) {
    validateOffer(offer);

    const pools = Object.fromEntries(
      GROUPS.map((group) => [group, []])
    );

    for (const setId of new Set(offer.setIds)) {
      const sourceRows = index.get(setId) ?? [];

      if (!sourceRows.length) {
        fail(
          `${offer.name} unavailable: set ${setId} has not been imported.`
        );
      }

      for (const row of sourceRows) {
        if (!GROUPS.includes(row.bucket)) {
          fail("Invalid catalog rarity group.");
        }

        const group = row.rarity
          ? poolForRarity(row.rarity)
          : row.bucket;

        pools[group].push(row.card_key);

        // Preserve the aggregate pool used by older pack definitions.
        // Unknown rarities already entered "special" above.
        if (
          !["common", "uncommon", "rare", "special"].includes(group)
        ) {
          pools.special.push(row.card_key);
        }
      }
    }

    for (const slot of offer.slots) {
      for (const group of Object.keys(slot)) {
        if (!pools[group]?.length) {
          fail(
            `${offer.name} unavailable: no ${group} cards. ` +
            "Run catalog sync or adjust slots."
          );
        }
      }
    }

    return { ...offer, pools };
  }

  async function offers() {
    // One catalog query for the whole shop, even with hundreds of offers.
    const setIds = [...new Set(definitions.flatMap((offer) => offer.setIds))];
    const { rows } = await db.query(
      `SELECT card_key, set_id, bucket, rarity FROM public.card_catalog
       WHERE set_id = ANY($1::text[]) AND active = 1 ORDER BY api_id, card_key`,
      [setIds]
    );
    const index = indexCatalog(rows);
    const result = [];
    for (const offer of definitions) {
      try {
        const snapshot = snapshotFromCatalog(offer, index);
        result.push({
          ...offer, ready: true, quote: hash(JSON.stringify(snapshot)).slice(0, 16),
          poolSizes: Object.fromEntries(Object.entries(snapshot.pools).map(([key, values]) => [key, values.length])),
        });
      } catch (error) {
        // Connection failures should reach the command error handler.
        if (!(error instanceof CardShopError)) throw error;
        result.push({ ...offer, ready: false, reason: error.message });
      }
    }
    return result;
  }

  async function action(id, guild, user, kind, target, fn) {
    if (typeof id !== "string" || !id || id.length > 100) fail("Invalid action ID.");
    return transaction(async (client) => {
      // Serialize retries before looking up their durable receipts.
      await advisoryLock(client, "cardshop:request", id);
      const { rows: previous } = await client.query(
        "SELECT * FROM public.card_actions WHERE id = $1", [id]
      );
      const old = previous[0];
      if (old) {
        if (old.guild_id !== guild || old.user_id !== user || old.kind !== kind || old.target !== target) {
          fail("Action ID mismatch.");
        }
        return JSON.parse(old.result);
      }
      const { rows: accounts } = await client.query(
        `SELECT balance FROM public.accounts
         WHERE guild_id = $1 AND user_id = $2 FOR UPDATE`, [guild, user]
      );
      if (!accounts[0]) fail("No economy account yet. Use !balance or !daily first.");
      number(accounts[0].balance, "balance");
      const result = await fn(client);
      await client.query(
        `INSERT INTO public.card_actions
         (id, guild_id, user_id, kind, target, result, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, guild, user, kind, target, JSON.stringify(result), Date.now()]
      );
      return result;
    });
  }

  async function buy(guild, user, offerId, requestId, expectedQuote, quantity = 1) {
    if (![1, 5, 10].includes(quantity)) fail("Choose 1, 5, or 10 packs.");
    const target = quantity === 1 ? offerId : `${offerId}*${quantity}`;
    return action(requestId, guild, user, "buy", target, async (client) => {
      const offer = definitions.find((pack) => pack.id === offerId);
      if (!offer) fail("That pack is no longer sold.");
      const snapshot = await snapshotOffer(client, offer);
      if (expectedQuote && expectedQuote !== hash(JSON.stringify(snapshot)).slice(0, 16)) {
        fail("This shop offer changed. Refresh !cardshop to see the current price and odds.");
      }
      const totalPrice = offer.price * quantity;
      if (!Number.isSafeInteger(totalPrice)) fail("Purchase total exceeds the supported limit.");
      const { rows } = await client.query(
        `UPDATE public.accounts SET balance = balance - $1
         WHERE guild_id = $2 AND user_id = $3 AND balance >= $1 RETURNING balance`,
        [totalPrice, guild, user]
      );
      if (!rows[0]) fail("You don't have enough currency for this purchase.");
      const packIds = [];
      const savedSnapshot = JSON.stringify(snapshot);
      const now = Date.now();
      for (let i = 0; i < quantity; i += 1) {
        const packId = randomUUID();
        await client.query(
          `INSERT INTO public.card_packs (id, guild_id, user_id, snapshot, bought_at)
           VALUES ($1, $2, $3, $4, $5)`, [packId, guild, user, savedSnapshot, now]
        );
        packIds.push(packId);
      }
      return {
        packId: packIds[0], packIds, quantity, name: offer.name, unitPrice: offer.price,
        price: totalPrice, balance: number(rows[0].balance, "balance"),
      };
    });
  }

  async function readPack(client, guild, user, id) {
    const { rows } = await client.query(
      `SELECT * FROM public.card_packs
       WHERE id = $1 AND guild_id = $2 AND user_id = $3 AND state = 'unopened'`,
      [id, guild, user]
    );
    if (!rows[0]) fail("That pack is no longer unopened or doesn't belong to you. Refresh !packs.");
    return decodePack(rows[0]);
  }

  async function pack(guild, user, id) {
    return readPack(db, guild, user, id);
  }

  async function packGroup(guild, user, packId) {
    return transaction(async (client) => {
      const owned = await readPack(client, guild, user, packId);
      const { rows } = await client.query(
        `SELECT COUNT(*) AS n FROM public.card_packs
         WHERE guild_id = $1 AND user_id = $2 AND state = 'unopened'
           AND snapshot::jsonb ->> 'id' = $3`, [guild, user, owned.snapshot.id]
      );
      return { owned, count: number(rows[0].n, "pack count") };
    }, true);
  }

  async function mintPack(client, guild, user, owned) {
    const selected = chooseCards(owned.snapshot, rng);
    const { rows: catalog } = await client.query(
      "SELECT card_key, payload FROM public.card_catalog WHERE card_key = ANY($1::text[])", [selected]
    );
    const byKey = new Map(catalog.map((row) => [row.card_key, row.payload]));
    const cards = selected.map((key) => {
      if (!byKey.has(key)) fail("A saved card is missing. No packs were consumed.");
      return { key, card: JSON.parse(byKey.get(key)), copyId: randomUUID() };
    });
    const changed = await client.query(
      `UPDATE public.card_packs SET state = 'opened'
       WHERE id = $1 AND guild_id = $2 AND user_id = $3 AND state = 'unopened'
       RETURNING id`, [owned.id, guild, user]
    );
    if (changed.rows.length !== 1) fail("This pack was already used.");
    const now = Date.now();
    for (const item of cards) {
      await client.query(
        `INSERT INTO public.card_owned
         (id, guild_id, user_id, card_key, pack_id, acquired_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [item.copyId, guild, user, item.key, owned.id, now]
      );
    }
    return cards.map(({ card, copyId }) => ({ card, copyId }));
  }

  async function openMany(guild, user, packId, requestId, quantity = 1) {
    if (![1, 5, 10, "all"].includes(quantity)) fail("Choose 1, 5, 10, or all packs.");
    const target = quantity === 1 ? packId : `${packId}*${quantity}`;
    return action(requestId, guild, user, "open", target, async (client) => {
      const anchor = await readPack(client, guild, user, packId);
      const { rows } = await client.query(
        `SELECT * FROM public.card_packs
         WHERE guild_id = $1 AND user_id = $2 AND state = 'unopened'
           AND snapshot::jsonb ->> 'id' = $3
         ORDER BY CASE WHEN id = $4 THEN 0 ELSE 1 END, bought_at, id
         LIMIT $5 FOR UPDATE`,
        [guild, user, anchor.snapshot.id, packId, quantity === "all" ? null : quantity]
      );
      if (quantity !== "all" && rows.length < quantity) {
        fail(`You need ${quantity} unopened ${anchor.snapshot.name} packs. No packs were consumed.`);
      }
      const cards = [];
      for (const row of rows) {
        cards.push(...await mintPack(client, guild, user, decodePack(row)));
      }
      return { packId, packIds: rows.map((row) => row.id), quantity: rows.length, name: anchor.snapshot.name, cards };
    });
  }

  async function open(guild, user, packId, requestId) {
    return openMany(guild, user, packId, requestId, 1);
  }

  async function sell(guild, user, packId, requestId) {
    return action(requestId, guild, user, "sell", packId, async (client) => {
      const owned = await readPack(client, guild, user, packId);
      const price = number(owned.snapshot.sellPrice, "saved sell price");
      const { rows } = await client.query(
        `UPDATE public.accounts SET balance = balance + $1
         WHERE guild_id = $2 AND user_id = $3 AND balance <= $4 RETURNING balance`,
        [price, guild, user, MAX_BALANCE - price]
      );
      if (!rows[0]) fail("This sale would exceed your balance limit.");
      const changed = await client.query(
        `UPDATE public.card_packs SET state = 'sold'
         WHERE id = $1 AND guild_id = $2 AND user_id = $3 AND state = 'unopened'
         RETURNING id`, [packId, guild, user]
      );
      if (changed.rows.length !== 1) fail("This pack was already used.");
      return { packId, name: owned.snapshot.name, price, balance: number(rows[0].balance, "balance") };
    });
  }

  async function listPacks(guild, user, page = 0) {
    return transaction(async (client) => {
      const { rows: counts } = await client.query(
        `SELECT COUNT(*) AS n FROM public.card_packs
         WHERE guild_id = $1 AND user_id = $2 AND state = 'unopened'`, [guild, user]
      );
      const total = number(counts[0].n, "pack count");
      const pages = Math.max(1, Math.ceil(total / 10));
      page = Number.isSafeInteger(page) ? Math.max(0, Math.min(page, pages - 1)) : 0;
      const { rows } = await client.query(
        `SELECT * FROM public.card_packs
         WHERE guild_id = $1 AND user_id = $2 AND state = 'unopened'
         ORDER BY bought_at DESC, id LIMIT 10 OFFSET $3`, [guild, user, page * 10]
      );
      return { total, page, pages, rows: rows.map(decodePack) };
    }, true);
  }

  async function listCards(guild, user, page = 0) {
    return transaction(async (client) => {
      const { rows: counts } = await client.query(
        "SELECT COUNT(*) AS n FROM public.card_owned WHERE guild_id = $1 AND user_id = $2", [guild, user]
      );
      const total = number(counts[0].n, "card count");
      const pageSize = 50;
      const pages = Math.max(1, Math.ceil(total / pageSize));
      page = Number.isSafeInteger(page) ? Math.max(0, Math.min(page, pages - 1)) : 0;
      const { rows } = await client.query(
        `SELECT o.id, c.payload FROM public.card_owned o
         JOIN public.card_catalog c ON c.card_key = o.card_key
         WHERE o.guild_id = $1 AND o.user_id = $2
         ORDER BY o.acquired_at DESC, o.id LIMIT $3 OFFSET $4`,
        [guild, user, pageSize, page * pageSize]
      );
      const items = rows.map((row) => ({ copyId: row.id, card: JSON.parse(row.payload) }));
      return { total, page, pages, pageSize, items, item: items[0] ?? null };
    }, true);
  }

  async function ownedCard(guild, user, copyId) {
    const { rows } = await db.query(
      `SELECT o.id, c.payload FROM public.card_owned o
       JOIN public.card_catalog c ON c.card_key = o.card_key
       WHERE o.id = $1 AND o.guild_id = $2 AND o.user_id = $3`, [copyId, guild, user]
    );
    if (!rows[0]) fail("This card is no longer in your collection. Refresh !cards.");
    return { copyId: rows[0].id, card: JSON.parse(rows[0].payload) };
  }

  async function opening(guild, user, id) {
    const { rows } = await db.query(
      `SELECT result FROM public.card_actions
       WHERE id = $1 AND guild_id = $2 AND user_id = $3 AND kind = 'open'`, [id, guild, user]
    );
    if (!rows[0]) fail("This opening is no longer available.");
    return JSON.parse(rows[0].result);
  }

  return { initialize, importSet, offers, buy, open, sell, pack, listPacks, listCards, ownedCard, opening, packGroup, openMany };
}
