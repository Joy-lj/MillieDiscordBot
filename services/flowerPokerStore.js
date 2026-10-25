// Uses your existing accounts + bets tables. No new tables or schema migration.
export function createFlowerPokerStore(db) {
  function reserveMatch(guildId, firstId, secondId, wager, matchId) {
    if (!Number.isSafeInteger(wager) || wager <= 0 || wager > 1_000_000) {
      throw new Error("Invalid wager.");
    }
    if (firstId === secondId) throw new Error("Choose another player.");
    return db.transaction(() => {
      const players = [firstId, secondId];
      const betIds = [`fp:${matchId}:a`, `fp:${matchId}:b`];
      if (db.prepare("SELECT id FROM bets WHERE id IN (?, ?)").get(...betIds)) {
        throw new Error("This challenge was already processed.");
      }
      for (const userId of players) {
        const active = db.prepare(`
          SELECT id FROM bets WHERE guild_id = ? AND user_id = ? AND status = 'open'
        `).get(guildId, userId);
        if (active) throw new Error("A player already has an active bet. Finish it first.");
        const account = db.prepare(`
          SELECT balance FROM accounts WHERE guild_id = ? AND user_id = ?
        `).get(guildId, userId);
        if (!account || account.balance < wager) {
          throw new Error("Both players must still have enough currency when accepting.");
        }
        if (!Number.isSafeInteger(account.balance) || account.balance > Number.MAX_SAFE_INTEGER - wager) {
          throw new Error("A player's balance is too high to accept this wager.");
        }
      }
      players.forEach((userId, i) => {
        db.prepare(`UPDATE accounts SET balance = balance - ? WHERE guild_id = ? AND user_id = ?`)
          .run(wager, guildId, userId);
        db.prepare(`INSERT INTO bets (id, guild_id, user_id, wager) VALUES (?, ?, ?, ?)`)
          .run(betIds[i], guildId, userId, wager);
      });
      return { guildId, players, betIds, wager };
    }).immediate();
  }

  // winner: 0 = first player, 1 = second player, null = tie/refund.
  function settleMatch(match, winner = null) {
    if (![null, 0, 1].includes(winner)) throw new Error("Invalid winner.");
    return db.transaction(() => {
      const rows = match.betIds.map((id) => db.prepare("SELECT * FROM bets WHERE id = ?").get(id));
      if (rows.every((row) => row?.status === "settled")) return null;
      if (rows.some((row, i) => !row || row.status !== "open" || row.guild_id !== match.guildId ||
        row.user_id !== match.players[i] || row.wager !== match.wager)) {
        throw new Error("Wager records are missing or inconsistent. No payout was made.");
      }
      const payouts = winner === null ? [match.wager, match.wager] :
        [winner === 0 ? match.wager * 2 : 0, winner === 1 ? match.wager * 2 : 0];
      const balances = rows.map((row, i) => {
        const updated = db.prepare(`
          UPDATE accounts SET balance = balance + ?
          WHERE guild_id = ? AND user_id = ? AND balance <= ?
          RETURNING balance
        `).get(payouts[i], row.guild_id, row.user_id, Number.MAX_SAFE_INTEGER - payouts[i]);
        if (!updated) throw new Error("Cannot settle: account missing or balance limit reached.");
        db.prepare("UPDATE bets SET status = 'settled' WHERE id = ?").run(row.id);
        return updated.balance;
      });
      return { payouts, balances };
    }).immediate();
  }
  return { reserveMatch, settleMatch };
}
