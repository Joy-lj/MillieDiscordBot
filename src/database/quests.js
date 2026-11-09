import db from "./connection.js";
import { questConfig } from "../config/quests.js";

const MAX_BALANCE = Number.MAX_SAFE_INTEGER;
export class QuestError extends Error {}

function definitions() {
  const list = questConfig.definitions.map(quest => ({ ...quest }));
  const ids = new Set();
  for (const quest of list) {
    if (!/^[a-z0-9-]{1,40}$/.test(quest.id) || quest.id === "all" || ids.has(quest.id) ||
      !["daily", "weekly"].includes(quest.period) || !["work", "fish", "dungeon"].includes(quest.metric) ||
      typeof quest.name !== "string" || !quest.name.trim() || quest.name.length > 60 ||
      !Number.isSafeInteger(quest.target) || quest.target < 1 || quest.target > 1_000_000 ||
      !Number.isSafeInteger(quest.reward) || quest.reward < 1 || quest.reward > MAX_BALANCE) {
      throw new QuestError("Invalid quest configuration.");
    }
    ids.add(quest.id);
  }
  for (const period of ["daily", "weekly"]) {
    if (list.filter(quest => quest.period === period).length > 6) {
      throw new QuestError("Use at most six quests per period.");
    }
  }
  return list;
}

const millis = value => {
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(time)) throw new QuestError("Invalid quest period.");
  return time;
};

function integer(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new QuestError("Unsupported quest balance or progress.");
  return n;
}

async function transaction(guildId, userId, fn) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO public.accounts (guild_id, user_id) VALUES ($1, $2)
       ON CONFLICT (guild_id, user_id) DO NOTHING`, [guildId, userId]
    );
    // Serialize all quest claims and balance changes for this player.
    const { rows } = await client.query(
      `SELECT balance FROM public.accounts
       WHERE guild_id = $1 AND user_id = $2 FOR UPDATE`, [guildId, userId]
    );
    if (!rows[0]) throw new QuestError("Could not load your economy account.");
    const result = await fn(client, integer(rows[0].balance));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); }
    catch (rollbackError) { console.error("Quest rollback failed:", rollbackError); }
    throw error;
  } finally { client.release(); }
}

async function board(client, guildId, userId, list) {
  const timeZone = questConfig.resetTimeZone;
  // Add days in local wall time before converting back to a timestamp,
  // so midnight resets remain correct on daylight-saving transitions.
  const { rows: times } = await client.query(
    `WITH clock AS (SELECT clock_timestamp() AS now),
     wall AS (SELECT now, now AT TIME ZONE $1 AS local FROM clock)
     SELECT now,
       date_trunc('day', local) AT TIME ZONE $1 AS daily_start,
       (date_trunc('day', local) + interval '1 day') AT TIME ZONE $1 AS daily_end,
       date_trunc('week', local) AT TIME ZONE $1 AS weekly_start,
       (date_trunc('week', local) + interval '7 days') AT TIME ZONE $1 AS weekly_end
     FROM wall`, [timeZone]
  );
  const t = times[0];
  const periods = {
    daily: { start: millis(t.daily_start), end: millis(t.daily_end) },
    weekly: { start: millis(t.weekly_start), end: millis(t.weekly_end) },
  };
  const { rows: activity } = await client.query(
    `SELECT kind,
       COUNT(*) FILTER (WHERE occurred_at >= $3::timestamptz)::text AS daily_count,
       COUNT(*)::text AS weekly_count
     FROM public.quest_activity
     WHERE guild_id = $1 AND user_id = $2
       AND occurred_at >= $4::timestamptz AND occurred_at <= $5::timestamptz
     GROUP BY kind`, [guildId, userId, t.daily_start, t.weekly_start, t.now]
  );
  const { rows: claims } = await client.query(
    `SELECT quest_id, period_start FROM public.quest_claims
     WHERE guild_id = $1 AND user_id = $2 AND period_start >= $3::timestamptz`,
    [guildId, userId, t.weekly_start]
  );
  const counts = new Map(activity.map(row => [row.kind, row]));
  const claimed = new Set(claims.map(row => `${row.quest_id}:${millis(row.period_start)}`));
  return { timeZone, periods, quests: list.map(quest => {
    const period = periods[quest.period];
    const progress = Math.min(quest.target, integer(counts.get(quest.metric)?.[`${quest.period}_count`] ?? 0));
    return { ...quest, ...period, progress,
      complete: progress >= quest.target, claimed: claimed.has(`${quest.id}:${period.start}`) };
  }) };
}

export async function getQuests(guildId, userId) {
  const list = definitions();
  return transaction(guildId, userId, client => board(client, guildId, userId, list));
}

export async function claimQuest(guildId, userId, questId) {
  const list = definitions();
  if (questId !== "all" && !list.some(quest => quest.id === questId)) {
    return { success: false, reason: "unknown_quest" };
  }
  return transaction(guildId, userId, async (client, balance) => {
    const current = await board(client, guildId, userId, list);
    const matches = current.quests.filter(quest => questId === "all" || quest.id === questId);
    if (questId !== "all") {
      if (matches[0].claimed) return { success: false, reason: "already_claimed" };
      if (!matches[0].complete) return { success: false, reason: "incomplete", quest: matches[0] };
    }
    const ready = matches.filter(quest => quest.complete && !quest.claimed);
    if (!ready.length) return { success: false, reason: "nothing_ready" };
    const reward = ready.reduce((sum, quest) => sum + quest.reward, 0);
    if (!Number.isSafeInteger(reward) || balance > MAX_BALANCE - reward) {
      return { success: false, reason: "balance_limit" };
    }
    for (const quest of ready) {
      // The unique key is an additional guard against duplicate payouts.
      await client.query(
        `INSERT INTO public.quest_claims
         (guild_id, user_id, quest_id, period_start, period_end, reward)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [guildId, userId, quest.id, new Date(quest.start), new Date(quest.end), quest.reward]
      );
    }
    const { rows } = await client.query(
      `UPDATE public.accounts SET balance = balance + $1
       WHERE guild_id = $2 AND user_id = $3 AND balance <= $4 RETURNING balance`,
      [reward, guildId, userId, MAX_BALANCE - reward]
    );
    if (!rows[0]) throw new QuestError("Could not credit the reward. The claim was rolled back.");
    return { success: true, reward, balance: integer(rows[0].balance), quests: ready };
  });
}
