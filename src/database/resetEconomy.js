import db from "./connection.js";

export function resetEconomy(guildId) {
  return db.transaction(() => {
    // Check and delete within the same transaction.
    const activeBet = db.prepare(`
      SELECT id FROM bets
      WHERE guild_id = ? AND status = 'open'
      LIMIT 1
    `).get(guildId);

    if (activeBet) {
      return { success: false, reason: "active_bet" };
    }

    db.prepare(`
      DELETE FROM bets WHERE guild_id = ?
    `).run(guildId);

    // Deleting accounts also resets their saved cooldowns.
    const result = db.prepare(`
      DELETE FROM accounts WHERE guild_id = ?
    `).run(guildId);

    return {
      success: true,
      accountsDeleted: result.changes,
    };
  }).immediate();
}