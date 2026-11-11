import { randomInt } from "node:crypto";
import { gatheringConfig } from "../src/config/gathering.js";
import { activityFor, rollGathering, GatheringError } from "./gatheringLogic.js";
export { GatheringError } from "./gatheringLogic.js";

const fail = message => { throw new GatheringError(message); };
const integer = n => {
  n = Number(n);
  if (!Number.isSafeInteger(n) || n < 0) fail("An inventory value exceeds the supported limit.");
  return n;
};

export function createGatheringStore(db, items, config = gatheringConfig, { rng = randomInt, clock = Date.now } = {}) {
  async function gather(guild, user, activity, requestId) {
    if (typeof requestId !== "string" || !requestId || requestId.length > 100) fail("Invalid gathering request ID.");
    if (!Object.hasOwn(config.activities ?? {}, activity)) fail("Unknown gathering activity.");
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(`INSERT INTO public.accounts (guild_id, user_id) VALUES ($1, $2)
        ON CONFLICT (guild_id, user_id) DO NOTHING`, [guild, user]);
      // Same account lock used by buying, crafting and equipping: serials cannot race.
      const account = await client.query(`SELECT user_id FROM public.accounts WHERE guild_id = $1 AND user_id = $2 FOR UPDATE`, [guild, user]);
      if (!account.rows[0]) fail("Could not load your account.");
      const old = await client.query(`SELECT activity, result FROM public.gathering_actions
        WHERE guild_id = $1 AND user_id = $2 AND request_id = $3`, [guild, user, requestId]);
      if (old.rows[0]) {
        if (old.rows[0].activity !== activity) fail("This request ID belongs to another activity.");
        const result = typeof old.rows[0].result === "string" ? JSON.parse(old.rows[0].result) : old.rows[0].result;
        await client.query("COMMIT");
        return result;
      }
      const definition = activityFor(config, items, activity);
      const now = integer(clock());
      const cooldown = await client.query(`SELECT next_gather_at FROM public.gathering_cooldowns
        WHERE guild_id = $1 AND user_id = $2 AND activity = $3 FOR UPDATE`, [guild, user, activity]);
      const readyAt = integer(cooldown.rows[0]?.next_gather_at ?? 0);
      let result;
      if (now < readyAt) {
        result = { success: false, reason: "cooldown", activity, nextGatherAt: readyAt };
      } else {
        const drops = rollGathering(config, items, activity, rng);
        for (const drop of drops) {
          const { rows } = await client.query(`SELECT serial_number FROM public.user_items
            WHERE guild_id = $1 AND user_id = $2 AND item_id = $3 ORDER BY serial_number`, [guild, user, drop.itemId]);
          const used = new Set(rows.map(row => integer(row.serial_number)));
          if (used.has(0)) fail("Invalid material serial number.");
          let next = 1;
          for (let n = 0; n < drop.quantity; n++) {
            while (used.has(next)) next++;
            if (!Number.isSafeInteger(next) || next > 2_147_483_647) fail("Material serial limit reached.");
            const granted = await client.query(`INSERT INTO public.user_items
              (guild_id, user_id, item_id, serial_number) VALUES ($1, $2, $3, $4) RETURNING id`,
              [guild, user, drop.itemId, next]);
            if (granted.rows.length !== 1) fail("Could not grant materials.");
            used.add(next);
          }
        }
        const nextGatherAt = integer(now + definition.cooldownMs);
        await client.query(`INSERT INTO public.gathering_cooldowns (guild_id, user_id, activity, next_gather_at)
          VALUES ($1, $2, $3, $4) ON CONFLICT (guild_id, user_id, activity)
          DO UPDATE SET next_gather_at = EXCLUDED.next_gather_at`, [guild, user, activity, nextGatherAt]);
        result = { success: true, activity, drops, nextGatherAt };
      }
      // Store cooldown failures too: replaying an old click never generates a new trip.
      await client.query(`INSERT INTO public.gathering_actions (guild_id, user_id, request_id, activity, result)
        VALUES ($1, $2, $3, $4, $5::jsonb)`, [guild, user, requestId, activity, JSON.stringify(result)]);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(console.error);
      throw error;
    } finally { client.release(); }
  }

  async function status(guild, user) {
    const now = integer(clock());
    const { rows } = await db.query(`SELECT activity, next_gather_at FROM public.gathering_cooldowns
      WHERE guild_id = $1 AND user_id = $2`, [guild, user]);
    return Object.keys(config.activities).map(activity => {
      const entry = activityFor(config, items, activity);
      const nextGatherAt = integer(rows.find(row => row.activity === activity)?.next_gather_at ?? 0);
      return { activity, name: entry.name, emoji: entry.emoji, nextGatherAt, ready: nextGatherAt <= now };
    });
  }
  return { gather, status };
}
