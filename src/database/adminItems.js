import db from "./connection.js";
import { ITEMS } from "../config/items.js";

export async function spawnItem(guildId, userId, itemId, quantity = 1) {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) {
    return { success: false, reason: "invalid_quantity" };
  }

  const item = Object.hasOwn(ITEMS, itemId) ? ITEMS[itemId] : null;
  if (!item) return { success: false, reason: "invalid_item" };

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO public.accounts (guild_id, user_id) VALUES ($1, $2)
       ON CONFLICT (guild_id, user_id) DO NOTHING`,
      [guildId, userId]
    );

    // Use the same account lock as purchases/equipment changes.
    const account = await client.query(
      `SELECT user_id FROM public.accounts
       WHERE guild_id = $1 AND user_id = $2 FOR UPDATE`,
      [guildId, userId]
    );
    if (!account.rows[0]) throw new Error("Could not lock recipient account.");

    const { rows } = await client.query(
      `SELECT serial_number FROM public.user_items
       WHERE guild_id = $1 AND user_id = $2 AND item_id = $3
       ORDER BY serial_number ASC`,
      [guildId, userId, itemId]
    );
    const used = new Set(rows.map(row => {
      const serial = Number(row.serial_number);
      if (!Number.isSafeInteger(serial) || serial < 1) {
        throw new Error("Invalid existing item serial.");
      }
      return serial;
    }));

    const addedItems = [];
    let nextSerial = 1;
    for (let i = 0; i < quantity; i++) {
      while (used.has(nextSerial)) nextSerial++;
      if (!Number.isSafeInteger(nextSerial)) throw new Error("Serial limit reached.");

      const inserted = await client.query(
        `INSERT INTO public.user_items (guild_id, user_id, item_id, serial_number)
         VALUES ($1, $2, $3, $4) RETURNING id, serial_number`,
        [guildId, userId, itemId, nextSerial]
      );
      if (!inserted.rows[0]) throw new Error("Could not insert item.");
      addedItems.push({
        id: String(inserted.rows[0].id),
        serial_number: Number(inserted.rows[0].serial_number),
      });
      used.add(nextSerial);
    }

    await client.query("COMMIT");
    return { success: true, item: item.name, quantity, addedItems };
  } catch (error) {
    try { await client.query("ROLLBACK"); }
    catch (rollbackError) { console.error("Spawn rollback failed:", rollbackError); }
    throw error;
  } finally {
    client.release();
  }
}
