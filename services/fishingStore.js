import { createHash, randomInt } from "node:crypto";
import { fishingConfig } from "../src/config/fishing.js";

export class FishingError extends Error { }
const fail = (message) => { throw new FishingError(message); };
const MAX_BALANCE = Number.MAX_SAFE_INTEGER;

function integer(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) fail(`Invalid ${label}.`);
  return number;
}

export function createFishingStore(
  db,
  config = fishingConfig,
  { rng = randomInt, clock = Date.now } = {}
) {
  function validate() {
    if (!Number.isSafeInteger(config.cooldownMs) || config.cooldownMs < 1000) {
      fail("Invalid fishing cooldown.");
    }
    if (!Array.isArray(config.fish) || !config.fish.length ||
      new Set(config.fish.map((fish) => fish.id)).size !== config.fish.length) {
      fail("Define at least one fish with unique IDs.");
    }
    for (const fish of config.fish) {
      if (!/^[a-z0-9_-]+$/.test(fish.id) || !fish.name || !fish.emoji || !fish.rarity ||
        !Number.isSafeInteger(fish.weight) || fish.weight <= 0 ||
        !Number.isSafeInteger(fish.sellValue) || fish.sellValue < 1 ||
        fish.sellValue > 1_000_000) fail("Invalid fish definition.");
    }
    const weight = config.fish.reduce((sum, fish) => sum + fish.weight, 0);
    if (!Number.isSafeInteger(weight) || weight > 1_000_000_000) {
      fail("Invalid total fish weight.");
    }
  }

  async function initialize() {
    validate();
    // Run fishing.sql in Supabase first. Startup only verifies dependencies.
    await db.query("SELECT guild_id, user_id, balance FROM public.accounts LIMIT 0");
    await db.query("SELECT guild_id, user_id, pet_type, stage FROM public.pets LIMIT 0");
    await db.query("SELECT guild_id, user_id, next_cast_at FROM public.fishing_cooldowns LIMIT 0");
    await db.query("SELECT guild_id, user_id, item_key, payload, quantity FROM public.fishing_bag LIMIT 0");
    await db.query("SELECT id, guild_id, user_id, kind, target, result, created_at FROM public.fishing_actions LIMIT 0");
  }

  async function action(requestId, guild, user, kind, target, fn) {
    if (typeof requestId !== "string" || !requestId || requestId.length > 100) {
      fail("Invalid request ID.");
    }
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      // Serializes duplicate request IDs, even if presented by different users.
      // This lock is released automatically on commit or rollback.
      const requestLock = createHash("sha256")
        .update(`fishing:request:${requestId}`).digest().readBigInt64BE(0).toString();
      await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [requestLock]);

      const { rows: previous } = await client.query(
        "SELECT * FROM public.fishing_actions WHERE id = $1", [requestId]
      );
      const old = previous[0];
      if (old) {
        if (old.guild_id !== guild || old.user_id !== user ||
          old.kind !== kind || old.target !== target) fail("Request ID mismatch.");
        const result = JSON.parse(old.result);
        await client.query("COMMIT");
        return result;
      }

      if (kind === "cast") {
        await client.query(
          `INSERT INTO public.accounts (guild_id, user_id) VALUES ($1, $2)
           ON CONFLICT (guild_id, user_id) DO NOTHING`, [guild, user]
        );
      }
      // All fishing writes for this player share their account row lock.
      const { rows: accounts } = await client.query(
        `SELECT balance FROM public.accounts
         WHERE guild_id = $1 AND user_id = $2 FOR UPDATE`, [guild, user]
      );
      if (!accounts[0]) fail("Could not load your account. Run !balance first.");

      const result = await fn(client);
      await client.query(
        `INSERT INTO public.fishing_actions
         (id, guild_id, user_id, kind, target, result, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [requestId, guild, user, kind, target, JSON.stringify(result), integer(clock(), "timestamp")]
      );
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); }
      catch (rollbackError) { console.error("Fishing rollback failed:", rollbackError); }
      throw error;
    } finally {
      client.release();
    }
  }

  async function cast(guild, user, requestId) {
    return action(requestId, guild, user, "cast", "-", async (client) => {
      validate();
      const now = integer(clock(), "timestamp");
      const { rows: cooldowns } = await client.query(
        `SELECT next_cast_at FROM public.fishing_cooldowns
         WHERE guild_id = $1 AND user_id = $2`, [guild, user]
      );
      if (cooldowns[0]) {
        const nextCastAt = integer(cooldowns[0].next_cast_at, "cooldown timestamp");
        if (nextCastAt > now) return { caught: false, nextCastAt };
      }

      const total = config.fish.reduce((sum, fish) => sum + fish.weight, 0);
      let roll = rng(total);
      if (!Number.isInteger(roll) || roll < 0 || roll >= total) fail("Invalid random draw.");
      let picked;
      for (const fish of config.fish) {
        if (roll < fish.weight) { picked = fish; break; }
        roll -= fish.weight;
      }
      const fish = {
        id: picked.id, name: picked.name, emoji: picked.emoji,
        rarity: picked.rarity, sellValue: picked.sellValue,
      };
      const payload = JSON.stringify(fish);
      const itemKey = createHash("sha256").update(payload).digest("hex").slice(0, 32);
      const { rows: stacks } = await client.query(
        `INSERT INTO public.fishing_bag AS bag
         (guild_id, user_id, item_key, payload, quantity)
         VALUES ($1, $2, $3, $4, 1)
         ON CONFLICT (guild_id, user_id, item_key)
         DO UPDATE SET quantity = bag.quantity + 1
         WHERE bag.quantity < 1000000
         RETURNING quantity`, [guild, user, itemKey, payload]
      );
      if (!stacks[0]) fail("That fish stack is full. Sell some fish first.");

      const { rows: pets } = await client.query(
        `SELECT pet_type, stage FROM public.pets
         WHERE guild_id = $1 AND user_id = $2`, [guild, user]
      );
      const pet = pets[0];
      let reduction = 0;
      if (pet?.pet_type === "bird") {
        if (Number(pet.stage) === 2) reduction = 30_000;
        else if (Number(pet.stage) === 3) reduction = 60_000;
      }
      const effectiveCooldownMs = Math.max(1000, config.cooldownMs - reduction);
      const nextCastAt = integer(now + effectiveCooldownMs, "cooldown timestamp");
      await client.query(
        `INSERT INTO public.fishing_cooldowns (guild_id, user_id, next_cast_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (guild_id, user_id)
         DO UPDATE SET next_cast_at = EXCLUDED.next_cast_at`, [guild, user, nextCastAt]
      );
      return { caught: true, fish, itemKey, nextCastAt };
    });
  }

  function decodeEntry(row) {
    return {
      itemKey: row.item_key,
      quantity: integer(row.quantity, "fish quantity"),
      fish: JSON.parse(row.payload),
    };
  }

  async function allEntries(client, guild, user) {
    const { rows } = await client.query(
      `SELECT item_key, quantity, payload FROM public.fishing_bag
       WHERE guild_id = $1 AND user_id = $2 ORDER BY item_key`, [guild, user]
    );
    return rows.map(decodeEntry);
  }

  async function bag(guild, user, page = 0) {
    const all = await allEntries(db, guild, user);
    const pages = Math.max(1, Math.ceil(all.length / 20));
    page = Number.isSafeInteger(page) ? Math.max(0, Math.min(page, pages - 1)) : 0;
    const totalFish = integer(all.reduce((sum, row) => sum + row.quantity, 0), "fish total");
    const totalValue = integer(
      all.reduce((sum, row) => sum + row.quantity * row.fish.sellValue, 0), "bag value"
    );
    return { page, pages, entries: all.slice(page * 20, page * 20 + 20), totalFish, totalValue };
  }

  async function readEntry(client, guild, user, key) {
    const { rows } = await client.query(
      `SELECT item_key, quantity, payload FROM public.fishing_bag
       WHERE guild_id = $1 AND user_id = $2 AND item_key = $3`, [guild, user, key]
    );
    if (!rows[0]) fail("You no longer have this fish. Refresh !fishbag.");
    return decodeEntry(rows[0]);
  }

  async function entry(guild, user, key) {
    return readEntry(db, guild, user, key);
  }

  // key=null sells the whole bag; otherwise sell 1 or 'all' of that stack.
  async function sell(guild, user, requestId, key = null, quantity = "all") {
    if (![1, "all"].includes(quantity) || (key === null && quantity !== "all")) {
      fail("Invalid sale quantity.");
    }
    const target = `${key ?? "bag"}:${quantity}`;
    return action(requestId, guild, user, "sell", target, async (client) => {
      const entries = key === null
        ? await allEntries(client, guild, user)
        : [await readEntry(client, guild, user, key)];
      if (!entries.length) fail("Your fish bag is empty.");
      const selected = entries.map((row) => ({ ...row, sold: quantity === 1 ? 1 : row.quantity }));
      const earned = selected.reduce((sum, row) => sum + row.sold * row.fish.sellValue, 0);
      const sold = integer(selected.reduce((sum, row) => sum + row.sold, 0), "sale quantity");
      if (!Number.isSafeInteger(earned) || earned <= 0) fail("Sale value is outside the supported limit.");
      const { rows: accounts } = await client.query(
        `UPDATE public.accounts SET balance = balance + $1
         WHERE guild_id = $2 AND user_id = $3 AND balance <= $4 RETURNING balance`,
        [earned, guild, user, MAX_BALANCE - earned]
      );
      if (!accounts[0]) fail("Could not credit this sale. Check your account and balance limit.");
      for (const row of selected) {
        if (row.sold === row.quantity) {
          await client.query(
            `DELETE FROM public.fishing_bag
             WHERE guild_id = $1 AND user_id = $2 AND item_key = $3`, [guild, user, row.itemKey]
          );
        } else {
          await client.query(
            `UPDATE public.fishing_bag SET quantity = quantity - $1
             WHERE guild_id = $2 AND user_id = $3 AND item_key = $4`,
            [row.sold, guild, user, row.itemKey]
          );
        }
      }
      return { sold, earned, balance: integer(accounts[0].balance, "balance") };
    });
  }

  return { initialize, cast, bag, entry, sell };
}
