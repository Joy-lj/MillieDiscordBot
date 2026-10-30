import { resolveHotCold } from "./hotColdLogic.js";

const MAX_BALANCE = Number.MAX_SAFE_INTEGER;

export function createHotColdStore(db) {
  return async function playHotCold(
    guildId,
    userId,
    wager,
    choice,
    messageId,
    draw
  ) {
    if (
      !Number.isSafeInteger(wager) ||
      wager < 1 ||
      wager > 1_000_000
    ) {
      return {
        error: "Bet a whole number between 1 and 1,000,000.",
      };
    }

    if (!["hot", "cold"].includes(choice)) {
      return { error: "Choose hot or cold." };
    }

    if (typeof messageId !== "string" || !messageId) {
      return { error: "Invalid message ID." };
    }

    const id = `hc:${messageId}`;
    const client = await db.connect();

    try {
      await client.query("BEGIN");

      // Serialize this player's wagers and balance changes.
      const { rows: accounts } = await client.query(
        `SELECT balance
         FROM public.accounts
         WHERE guild_id = $1 AND user_id = $2
         FOR UPDATE`,
        [guildId, userId]
      );

      const { rows: existing } = await client.query(
        `SELECT id FROM public.bets WHERE id = $1`,
        [id]
      );

      if (existing.length > 0) {
        await client.query("COMMIT");

        return {
          error: "This wager has already been processed.",
        };
      }

      const { rows: active } = await client.query(
        `SELECT id
         FROM public.bets
         WHERE guild_id = $1
           AND user_id = $2
           AND status = 'open'
         LIMIT 1`,
        [guildId, userId]
      );

      if (active.length > 0) {
        await client.query("COMMIT");

        return { error: "Finish your active bet first." };
      }

      const account = accounts[0];
      const balance = account ? Number(account.balance) : 0;

      if (account && (
        !Number.isSafeInteger(balance) ||
        balance < 0
      )) {
        throw new Error("Account balance is outside the supported range.");
      }

      if (!account || balance < wager) {
        await client.query("COMMIT");

        return {
          error: "You don't have enough currency for that wager.",
        };
      }

      // White pays 3x total: the maximum net profit is 2x.
      if (balance > MAX_BALANCE - 2 * wager) {
        await client.query("COMMIT");

        return {
          error: "Your balance is too high for this wager.",
        };
      }

      const outcome = resolveHotCold(choice, draw);

      if (!outcome || ![0, 2, 3].includes(outcome.multiplier)) {
        throw new Error("Invalid hot/cold payout multiplier.");
      }

      const payout = wager * outcome.multiplier;

      // History, deduction, and payout share this transaction.
      await client.query(
        `INSERT INTO public.bets
           (id, guild_id, user_id, wager)
         VALUES ($1, $2, $3, $4)`,
        [id, guildId, userId, wager]
      );

      const { rows: updated } = await client.query(
        `UPDATE public.accounts
         SET balance = balance - $1 + $2
         WHERE guild_id = $3
           AND user_id = $4
           AND balance >= $1
         RETURNING balance`,
        [wager, payout, guildId, userId]
      );

      if (!updated[0]) {
        throw new Error("Account disappeared during settlement.");
      }

      const newBalance = Number(updated[0].balance);

      if (
        !Number.isSafeInteger(newBalance) ||
        newBalance < 0
      ) {
        throw new Error("Settlement exceeds the supported balance range.");
      }

      await client.query(
        `UPDATE public.bets
         SET status = 'settled'
         WHERE id = $1`,
        [id]
      );

      const result = {
        ...outcome,
        wager,
        payout,
        profit: payout - wager,
        balance: newBalance,
      };

      await client.query("COMMIT");

      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Hot/cold rollback failed:", rollbackError);
      }

      if (error.code === "23505") {
        if (error.constraint === "bets_pkey") {
          return {
            error: "This wager has already been processed.",
          };
        }

        if (error.constraint === "bets_one_open_per_player") {
          return { error: "Finish your active bet first." };
        }
      }

      throw error;
    } finally {
      client.release();
    }
  };
}