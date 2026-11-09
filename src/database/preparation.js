import db from "./connection.js";
import { ITEMS } from "../config/items.js";
import { craftingConfig } from "../config/crafting.js";

export async function supplyStatus(guild, user) {
  const { rows } = await db.query(
    `SELECT item_id, COUNT(*) FILTER (WHERE is_locked = FALSE)::int AS available
     FROM public.user_items WHERE guild_id = $1 AND user_id = $2 GROUP BY item_id`, [guild, user]
  );
  const queued = await db.query(`SELECT item_id FROM public.dungeon_supplies WHERE guild_id = $1 AND user_id = $2`, [guild, user]);
  const account = await db.query(`SELECT balance FROM public.accounts WHERE guild_id = $1 AND user_id = $2`, [guild, user]);
  const balance = Number(account.rows[0]?.balance ?? 0);
  if (!Number.isSafeInteger(balance) || balance < 0) throw new Error("Invalid account balance.");
  const available = id => Number(rows.find(row => row.item_id === id)?.available ?? 0);
  return { prepared: queued.rows[0]?.item_id ?? null, balance,
    supplies: Object.keys(craftingConfig.supplies).map(id => {
      const recipe = craftingConfig.recipes[id];
      return { id, name: ITEMS[id]?.name ?? id, description: ITEMS[id]?.description ?? "", available: available(id),
        fee: recipe?.fee ?? 0,
        requirements: (recipe?.ingredients ?? []).map(row => ({
          itemId: row.itemId, name: ITEMS[row.itemId]?.name ?? row.itemId,
          required: row.quantity, available: available(row.itemId),
        })),
      };
    }),
  };
}

export async function prepareSupply(guild, user, itemId) {
  if (itemId !== "clear" && (!Object.hasOwn(craftingConfig.supplies, itemId) || ITEMS[itemId]?.type !== "consumable")) {
    return { success: false, message: "Unknown supply. Use !prepare to see available supplies." };
  }
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const account = await client.query(`SELECT user_id FROM public.accounts WHERE guild_id = $1 AND user_id = $2 FOR UPDATE`, [guild, user]);
    if (!account.rows[0]) { await client.query("COMMIT"); return { success: false, message: "Use !balance to create an account first." }; }
    if (itemId === "clear") {
      await client.query(`DELETE FROM public.dungeon_supplies WHERE guild_id = $1 AND user_id = $2`, [guild, user]);
    } else {
      const owned = await client.query(`SELECT id FROM public.user_items WHERE guild_id = $1 AND user_id = $2 AND item_id = $3 AND is_locked = FALSE LIMIT 1`, [guild, user, itemId]);
      if (!owned.rows[0]) { await client.query("COMMIT"); return { success: false, message: "You need an unlocked copy of that supply. Craft one first." }; }
      await client.query(`INSERT INTO public.dungeon_supplies (guild_id, user_id, item_id) VALUES ($1, $2, $3)
        ON CONFLICT (guild_id, user_id) DO UPDATE SET item_id = EXCLUDED.item_id`, [guild, user, itemId]);
    }
    await client.query("COMMIT");
    return { success: true, message: itemId === "clear" ? "Prepared supply cleared. No item was consumed." : `${ITEMS[itemId].name} prepared for your next dungeon. It will be consumed when the run starts.` };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch (rollbackError) { console.error("Preparation rollback failed:", rollbackError); }
    throw error;
  } finally { client.release(); }
}
