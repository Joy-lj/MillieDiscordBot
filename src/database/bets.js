import { randomUUID } from "node:crypto";
import db from "./connection.js";

const MAX_BALANCE = Number.MAX_SAFE_INTEGER;
const MAX_WAGER = 100_000_000;
// Maximum combined wager for the entire blackjack game.
const MAX_BLACKJACK_WAGER = 1_000_000_000;

export async function increaseBetWager(id, amount, expectedWager) {
  if (
    !Number.isSafeInteger(amount) ||
    amount < 1 ||
    !Number.isSafeInteger(expectedWager) ||
    expectedWager < 1
  ) {
    return { error: "Invalid additional wager." };
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const betResult = await client.query(
      `SELECT guild_id, user_id, wager, status
       FROM public.bets
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

    const bet = betResult.rows[0];

    async function reject(error) {
      await client.query("ROLLBACK");
      return { error };
    }

    if (!bet || bet.status !== "open") {
      return await reject("This bet is no longer active.");
    }

    const currentWager = Number(bet.wager);

    // Prevent the same wager change from being applied twice.
    if (currentWager !== expectedWager) {
      return await reject(
        "The game's wager changed. This action was not charged."
      );
    }

    const nextWager = currentWager + amount;

    if (
      !Number.isSafeInteger(nextWager) ||
      nextWager > MAX_BLACKJACK_WAGER
    ) {
      return await reject(
        "Splitting or doubling would exceed the game's " +
        "1,000,000 total wager limit."
      );
    }

    const accountResult = await client.query(
      `SELECT balance
       FROM public.accounts
       WHERE guild_id = $1 AND user_id = $2
       FOR UPDATE`,
      [bet.guild_id, bet.user_id]
    );

    const balance = Number(accountResult.rows[0]?.balance);

    if (!Number.isSafeInteger(balance) || balance < amount) {
      return await reject(
        "You don't have enough currency for that additional wager."
      );
    }

    // Leave enough room for the eventual payout.
    const maximumPayout = Math.floor(nextWager * 2.5);

    if (
      balance - amount >
      Number.MAX_SAFE_INTEGER - maximumPayout
    ) {
      return await reject(
        "Your balance is too high to increase this wager."
      );
    }

    await client.query(
      `UPDATE public.accounts
       SET balance = balance - $1
       WHERE guild_id = $2 AND user_id = $3`,
      [amount, bet.guild_id, bet.user_id]
    );

    await client.query(
      `UPDATE public.bets
       SET wager = $1
       WHERE id = $2`,
      [nextWager, id]
    );

    await client.query("COMMIT");

    return {
      success: true,
      wager: nextWager,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(console.error);
    throw error;
  } finally {
    client.release();
  }
}

function safeInteger(value, name) {
  const number = Number(value);

  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`${name} is outside the supported integer range.`);
  }

  return number;
}

// All transaction queries must use the same client.
async function transaction(callback) {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const result = await callback(client);

    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Bet rollback failed:", rollbackError);
    }

    throw error;
  } finally {
    client.release();
  }
}

export async function initializeBetting() {
  // Create the table separately using Supabase's SQL Editor.
  // Run this once during startup, before accepting commands.
  const { rows: unfinished } = await db.query(
    `SELECT id, wager
     FROM public.bets
     WHERE status = 'open'
     ORDER BY id`
  );

  let refunded = 0;

  for (const bet of unfinished) {
    const balance = await settleBet(
      bet.id,
      safeInteger(bet.wager, "Wager")
    );

    if (balance !== null) {
      refunded += 1;
    }
  }

  console.log(`Betting initialized. Refunded ${refunded} interrupted bets.`);
}

export async function startBet(guildId, userId, wager) {
  if (
    !Number.isSafeInteger(wager) ||
    wager < 1 ||
    wager > MAX_WAGER
  ) {
    return {
      error: "Bet a whole number between 1 and 1,000,000.",
    };
  }

  try {
    return await transaction(async (client) => {
      // Lock the account so simultaneous commands cannot spend
      // the same balance or start competing games.
      const { rows: accounts } = await client.query(
        `SELECT balance
         FROM public.accounts
         WHERE guild_id = $1 AND user_id = $2
         FOR UPDATE`,
        [guildId, userId]
      );

      const { rows: active } = await client.query(
        `SELECT id
         FROM public.bets
         WHERE guild_id = $1
           AND user_id = $2
           AND status = 'open'`,
        [guildId, userId]
      );

      if (active.length > 0) {
        return { error: "Finish your current game first!" };
      }

      const account = accounts[0];

      if (!account) {
        return {
          error: "You don't have enough currency for that bet.",
        };
      }

      const balance = safeInteger(account.balance, "Balance");

      if (balance < wager) {
        return {
          error: "You don't have enough currency for that bet.",
        };
      }

      const maximumProfit = Math.floor(wager * 2.5) - wager;

      if (balance > MAX_BALANCE - maximumProfit) {
        return {
          error: "Your balance is too high to place this bet.",
        };
      }

      await client.query(
        `UPDATE public.accounts
         SET balance = balance - $1
         WHERE guild_id = $2 AND user_id = $3`,
        [wager, guildId, userId]
      );

      const id = randomUUID();

      await client.query(
        `INSERT INTO public.bets (id, guild_id, user_id, wager)
         VALUES ($1, $2, $3, $4)`,
        [id, guildId, userId, wager]
      );

      return { id, wager };
    });
  } catch (error) {
    // If another code path inserted an open bet concurrently,
    // the transaction rolls back the balance deduction.
    if (
      error.code === "23505" &&
      error.constraint === "bets_one_open_per_player"
    ) {
      return { error: "Finish your current game first!" };
    }

    throw error;
  }
}

export async function settleBet(id, payout) {
  return transaction(async (client) => {
    // Read ownership first so accounts can consistently be locked
    // before bets, matching startBet's lock order.
    const { rows: candidates } = await client.query(
      `SELECT guild_id, user_id
       FROM public.bets
       WHERE id = $1 AND status = 'open'`,
      [id]
    );

    const candidate = candidates[0];

    if (!candidate) {
      return null;
    }

    const { rows: accounts } = await client.query(
      `SELECT balance
       FROM public.accounts
       WHERE guild_id = $1 AND user_id = $2
       FOR UPDATE`,
      [candidate.guild_id, candidate.user_id]
    );

    // Recheck after obtaining the account lock.
    // Another settlement might have finished while we waited.
    const { rows: bets } = await client.query(
      `SELECT id, guild_id, user_id, wager
       FROM public.bets
       WHERE id = $1 AND status = 'open'
       FOR UPDATE`,
      [id]
    );

    const bet = bets[0];

    // A completed bet cannot pay out twice.
    if (!bet) {
      return null;
    }

    const wager = safeInteger(bet.wager, "Wager");

    if (
      !Number.isSafeInteger(payout) ||
      payout < 0 ||
      payout > Math.floor(wager * 2.5)
    ) {
      throw new Error("Invalid bet payout.");
    }

    if (!accounts[0]) {
      throw new Error("Could not credit payout: missing account.");
    }

    const { rows: updated } = await client.query(
      `UPDATE public.accounts
       SET balance = balance + $1
       WHERE guild_id = $2
         AND user_id = $3
         AND balance <= $4
       RETURNING balance`,
      [
        payout,
        bet.guild_id,
        bet.user_id,
        MAX_BALANCE - payout,
      ]
    );

    if (!updated[0]) {
      throw new Error("Could not credit payout: balance limit.");
    }

    await client.query(
      `UPDATE public.bets
       SET status = 'settled'
       WHERE id = $1`,
      [id]
    );

    return safeInteger(updated[0].balance, "Balance");
  });
}