// import { randomUUID } from "node:crypto";
// import db from "./connection.js";

// export function initializeBetting() {
//   db.exec(`
//     CREATE TABLE IF NOT EXISTS bets (
//       id TEXT PRIMARY KEY,
//       guild_id TEXT NOT NULL,
//       user_id TEXT NOT NULL,
//       wager INTEGER NOT NULL CHECK (wager > 0),
//       status TEXT NOT NULL DEFAULT 'open'
//         CHECK (status IN ('open', 'settled'))
//     )
//   `);

//   // Refund interrupted games when this bot process starts.
//   const unfinished = db.prepare(`
//     SELECT id, wager FROM bets WHERE status = 'open'
//   `).all();

//   for (const bet of unfinished) {
//     settleBet(bet.id, bet.wager);
//   }
// }
// export function startBet(guildId, userId, wager) {
//   if (!Number.isSafeInteger(wager) || wager < 1 || wager > 1_000_000) {
//     return { error: "Bet a whole number between 1 and 1,000,000." };
//   }

//   return db.transaction(() => {
//     const active = db.prepare(`
//       SELECT id FROM bets
//       WHERE guild_id = ? AND user_id = ? AND status = 'open'
//     `).get(guildId, userId);

//     if (active) {
//       return { error: "Finish your current game first!" };
//     }

//     const account = db.prepare(`
//       SELECT balance FROM accounts
//       WHERE guild_id = ? AND user_id = ?
//     `).get(guildId, userId);

//     if (!account || account.balance < wager) {
//       return { error: "You don't have enough currency for that bet." };
//     }

//     const maximumProfit = Math.floor(wager * 2.5) - wager;
//     if (account.balance > Number.MAX_SAFE_INTEGER - maximumProfit) {
//       return { error: "Your balance is too high to place this bet." };
//     }


//     db.prepare(`
//       UPDATE accounts SET balance = balance - ?
//       WHERE guild_id = ? AND user_id = ?
//     `).run(wager, guildId, userId);

//     const id = randomUUID();

//     db.prepare(`
//       INSERT INTO bets (id, guild_id, user_id, wager)
//       VALUES (?, ?, ?, ?)
//     `).run(id, guildId, userId, wager);

//     return { id, wager };
//   }).immediate();
// }

// export function settleBet(id, payout) {
//   return db.transaction(() => {
//     const bet = db.prepare(`
//       SELECT * FROM bets WHERE id = ? AND status = 'open'
//     `).get(id);

//     // A completed bet cannot pay out twice.
//     if (!bet) return null;

//     if (
//       !Number.isSafeInteger(payout) ||
//       payout < 0 ||
//       payout > Math.floor(bet.wager * 2.5)
//     ) {
//       throw new Error("Invalid bet payout.");
//     }

//     const account = db.prepare(`
//       UPDATE accounts
//       SET balance = balance + ?
//       WHERE guild_id = ? AND user_id = ?
//         AND balance <= ?
//       RETURNING balance
//     `).get(
//       payout,
//       bet.guild_id,
//       bet.user_id,
//       Number.MAX_SAFE_INTEGER - payout
//     );

//     if (!account) {
//       throw new Error("Could not credit payout: balance limit or missing account.");
//     }

//     db.prepare(`
//       UPDATE bets SET status = 'settled' WHERE id = ?
//     `).run(id);

//     return account.balance;
//   }).immediate();
// }

import { randomUUID } from "node:crypto";
import db from "./connection.js";

const MAX_BALANCE = Number.MAX_SAFE_INTEGER;
const MAX_WAGER = 1_000_000;

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