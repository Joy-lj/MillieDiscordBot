import { resolveHotCold } from "./hotColdLogic.js";

export function createHotColdStore(db) {
  return function playHotCold(guildId, userId, wager, choice, messageId, draw) {
    if (!Number.isSafeInteger(wager) || wager < 1 || wager > 1_000_000) {
      return { error: "Bet a whole number between 1 and 1,000,000." };
    }
    if (!["hot", "cold"].includes(choice)) return { error: "Choose hot or cold." };

    // Draw, wager deduction, payout, and history either all commit or all roll back.
    return db.transaction(() => {
      const id = `hc:${messageId}`;
      if (db.prepare("SELECT id FROM bets WHERE id = ?").get(id)) {
        return { error: "This wager has already been processed." };
      }
      if (db.prepare(`
        SELECT id FROM bets WHERE guild_id = ? AND user_id = ? AND status = 'open'
      `).get(guildId, userId)) {
        return { error: "Finish your active bet first." };
      }
      const account = db.prepare(`
        SELECT balance FROM accounts WHERE guild_id = ? AND user_id = ?
      `).get(guildId, userId);
      if (!account || account.balance < wager) {
        return { error: "You don't have enough currency for that wager." };
      }
      // White returns 3x, making the largest net balance increase 2x the wager.
      if (!Number.isSafeInteger(account.balance) ||
          account.balance > Number.MAX_SAFE_INTEGER - 2 * wager) {
        return { error: "Your balance is too high for this wager." };
      }

      const outcome = resolveHotCold(choice, draw);
      const payout = wager * outcome.multiplier;
      db.prepare(`INSERT INTO bets (id, guild_id, user_id, wager) VALUES (?, ?, ?, ?)`)
        .run(id, guildId, userId, wager);
      db.prepare(`UPDATE accounts SET balance = balance - ? WHERE guild_id = ? AND user_id = ?`)
        .run(wager, guildId, userId);
      const updated = db.prepare(`
        UPDATE accounts SET balance = balance + ?
        WHERE guild_id = ? AND user_id = ? RETURNING balance
      `).get(payout, guildId, userId);
      if (!updated) throw new Error("Account disappeared during settlement.");
      db.prepare("UPDATE bets SET status = 'settled' WHERE id = ?").run(id);
      return { ...outcome, wager, payout, profit: payout - wager, balance: updated.balance };
    }).immediate();
  };
}
