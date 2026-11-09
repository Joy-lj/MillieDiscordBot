import { craftingConfig } from "../src/config/crafting.js";
import { DungeonError } from "./dungeonLogic.js";

// Caller already holds the player's account lock, inside run creation/acceptance.
// Preparation stores a TYPE, not a reserved copy; choose an unlocked copy at start.
export async function consumePreparedSupply(client, guild, user, player, items) {
  const { rows } = await client.query(
    `SELECT item_id FROM public.dungeon_supplies WHERE guild_id = $1 AND user_id = $2 FOR UPDATE`, [guild, user]
  );
  if (!rows[0]) return player;
  const id = rows[0].item_id, item = Object.hasOwn(items, id) ? items[id] : null;
  const effect = Object.hasOwn(craftingConfig.supplies, id) ? craftingConfig.supplies[id] : null;
  if (!item || item.type !== "consumable" || !effect) throw new DungeonError("Your prepared supply is unavailable. Use !prepare clear.");
  const found = await client.query(
    `SELECT id, serial_number FROM public.user_items WHERE guild_id = $1 AND user_id = $2 AND item_id = $3 AND is_locked = FALSE
     ORDER BY serial_number LIMIT 1 FOR UPDATE`, [guild, user, id]
  );
  const copy = found.rows[0];
  if (!copy) throw new DungeonError(`No unlocked ${item.name} remains. Use !prepare clear or prepare another supply.`);
  const bonus = effect.accuracyBonus ?? 0, shield = effect.shieldRatio ?? 0, potions = effect.potions ?? 0;
  if (!Number.isFinite(bonus) || bonus < 0 || bonus > 1 || !Number.isFinite(shield) || shield < 0 || shield > 1 ||
    !Number.isSafeInteger(potions) || potions < 0 || potions > 10) throw new Error("Invalid supply configuration.");
  const removed = await client.query(
    `DELETE FROM public.user_items WHERE guild_id = $1 AND user_id = $2 AND id = $3 AND is_locked = FALSE RETURNING id`, [guild, user, copy.id]
  );
  if (removed.rows.length !== 1) throw new Error("Prepared supply changed. Dungeon entry was rolled back.");
  await client.query(`DELETE FROM public.dungeon_supplies WHERE guild_id = $1 AND user_id = $2`, [guild, user]);
  const result = structuredClone(player);
  result.potions += potions;
  result.accuracyBonus = Math.min(1, (result.accuracyBonus ?? 0) + bonus);
  result.shield = (result.shield ?? 0) + Math.ceil(result.maxHealth * shield);
  result.preparedSupply = { itemId: id, name: item.name, instanceId: String(copy.id), serialNumber: Number(copy.serial_number), effect: structuredClone(effect) };
  return result;
}
