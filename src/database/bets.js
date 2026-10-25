import { randomUUID } from "node:crypto";
import db from "./connection.js";

export function initializeBetting() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bets (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      wager INTEGER NOT NULL CHECK (wager > 0),
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'settled'))
    )
  `);

  // Refund interrupted games when this bot process starts.
  const unfinished = db.prepare(`
    SELECT id, wager FROM bets WHERE status = 'open'
  `).all();

  for (const bet of unfinished) {
    settleBet(bet.id, bet.wager);
  }
}
export function startBet(guildId, userId, wager) {
  if (!Number.isSafeInteger(wager) || wager < 1 || wager > 1_000_000) {
    return { error: "Bet a whole number between 1 and 1,000,000." };
  }

  return db.transaction(() => {
    const active = db.prepare(`
      SELECT id FROM bets
      WHERE guild_id = ? AND user_id = ? AND status = 'open'
    `).get(guildId, userId);

    if (active) {
      return { error: "Finish your current game first!" };
    }

    const account = db.prepare(`
      SELECT balance FROM accounts
      WHERE guild_id = ? AND user_id = ?
    `).get(guildId, userId);

    if (!account || account.balance < wager) {
      return { error: "You don't have enough currency for that bet." };
    }

    const maximumProfit = Math.floor(wager * 2.5) - wager;
    if (account.balance > Number.MAX_SAFE_INTEGER - maximumProfit) {
      return { error: "Your balance is too high to place this bet." };
    }


    db.prepare(`
      UPDATE accounts SET balance = balance - ?
      WHERE guild_id = ? AND user_id = ?
    `).run(wager, guildId, userId);

    const id = randomUUID();

    db.prepare(`
      INSERT INTO bets (id, guild_id, user_id, wager)
      VALUES (?, ?, ?, ?)
    `).run(id, guildId, userId, wager);

    return { id, wager };
  }).immediate();
}

export function settleBet(id, payout) {
  return db.transaction(() => {
    const bet = db.prepare(`
      SELECT * FROM bets WHERE id = ? AND status = 'open'
    `).get(id);

    // A completed bet cannot pay out twice.
    if (!bet) return null;

    if (
      !Number.isSafeInteger(payout) ||
      payout < 0 ||
      payout > Math.floor(bet.wager * 2.5)
    ) {
      throw new Error("Invalid bet payout.");
    }

    const account = db.prepare(`
      UPDATE accounts
      SET balance = balance + ?
      WHERE guild_id = ? AND user_id = ?
        AND balance <= ?
      RETURNING balance
    `).get(
      payout,
      bet.guild_id,
      bet.user_id,
      Number.MAX_SAFE_INTEGER - payout
    );

    if (!account) {
      throw new Error("Could not credit payout: balance limit or missing account.");
    }

    db.prepare(`
      UPDATE bets SET status = 'settled' WHERE id = ?
    `).run(id);

    return account.balance;
  }).immediate();
}