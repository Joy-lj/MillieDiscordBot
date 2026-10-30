import db from "./connection.js";

export async function resetEconomy(guildId) {
  if (typeof guildId !== "string" || !guildId) throw new Error("Invalid guild ID.");
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    // Rare admin operation: block concurrent writes and SELECT FOR UPDATE on
    // these tables before checking bets. Ordinary reads can still proceed.
    // accounts is locked first, matching the migrated betting write paths.
    await client.query("LOCK TABLE public.accounts IN EXCLUSIVE MODE");
    await client.query("LOCK TABLE public.bets IN EXCLUSIVE MODE");

    const { rows } = await client.query(
      `SELECT id FROM public.bets
       WHERE guild_id = $1 AND status = 'open' LIMIT 1`, [guildId]
    );
    if (rows.length) {
      await client.query("COMMIT");
      return { success: false, reason: "active_bet" };
    }

    await client.query("DELETE FROM public.bets WHERE guild_id = $1", [guildId]);
    // FK cascades clean user_items and the migrated card/fishing tables.
    const result = await client.query("DELETE FROM public.accounts WHERE guild_id = $1", [guildId]);
    await client.query("COMMIT");
    return { success: true, accountsDeleted: result.rowCount };
  } catch (error) {
    try { await client.query("ROLLBACK"); }
    catch (rollbackError) { console.error("Economy reset rollback failed:", rollbackError); }
    throw error;
  } finally {
    client.release();
  }
}
