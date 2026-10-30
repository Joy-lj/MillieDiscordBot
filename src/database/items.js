import db from "./connection.js";
import { ITEMS } from "../config/items.js";

// Preserve existing command imports.
export { ITEMS };
const MAX_INTEGER = Number.MAX_SAFE_INTEGER;

function integer(value, name) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw new Error(`Invalid ${name}.`);
  return result;
}

function positiveInteger(value) {
  if (typeof value === "string") {
    if (!/^\d+$/.test(value.trim())) return null;
    value = Number(value.trim());
  }
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function itemPrice(item) {
  if (!Number.isSafeInteger(item.price) || item.price <= 0) {
    throw new Error("Item price must be a positive whole number.");
  }
  return item.price;
}

function decodeItem(row) {
  return {
    ...row,
    id: integer(row.id, "item instance ID"),
    serial_number: integer(row.serial_number, "serial number"),
  };
}

async function transaction(fn) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); }
    catch (rollbackError) { console.error("Item rollback failed:", rollbackError); }
    throw error;
  } finally {
    client.release();
  }
}

async function lockAccount(client, guildId, userId, create = false) {
  if (create) {
    await client.query(
      `INSERT INTO public.accounts (guild_id, user_id) VALUES ($1, $2)
       ON CONFLICT (guild_id, user_id) DO NOTHING`, [guildId, userId]
    );
  }
  const { rows } = await client.query(
    `SELECT balance, equipped_weapon_id, equipped_armor_id FROM public.accounts
     WHERE guild_id = $1 AND user_id = $2 FOR UPDATE`, [guildId, userId]
  );
  return rows[0] ?? null;
}

async function ownedItem(client, guildId, userId, itemId, serialNumber) {
  const { rows } = await client.query(
    `SELECT id, item_id, serial_number FROM public.user_items
     WHERE guild_id = $1 AND user_id = $2 AND item_id = $3 AND serial_number = $4`,
    [guildId, userId, itemId, serialNumber]
  );
  return rows[0] ? decodeItem(rows[0]) : null;
}

export async function getUserInventory(guildId, userId) {
  const { rows } = await db.query(
    `SELECT id, item_id, serial_number FROM public.user_items
     WHERE guild_id = $1 AND user_id = $2 ORDER BY item_id, serial_number ASC`,
    [guildId, userId]
  );
  return rows.map(decodeItem);
}

export async function getUserCombatStats(guildId, userId) {
  // One query gives a consistent view; joins verify equipment ownership.
  const { rows } = await db.query(
    `SELECT a.balance, a.equipped_weapon_id, a.equipped_armor_id,
            w.item_id AS weapon_item_id, w.serial_number AS weapon_serial,
            r.item_id AS armor_item_id, r.serial_number AS armor_serial
     FROM public.accounts a
     LEFT JOIN public.user_items w ON w.id = a.equipped_weapon_id
       AND w.guild_id = a.guild_id AND w.user_id = a.user_id
     LEFT JOIN public.user_items r ON r.id = a.equipped_armor_id
       AND r.guild_id = a.guild_id AND r.user_id = a.user_id
     WHERE a.guild_id = $1 AND a.user_id = $2`, [guildId, userId]
  );
  const account = rows[0];
  if (!account) {
    return {
      balance: 0, attack: 0, defense: 0, totalPower: 0,
      equippedWeaponInstanceId: null, equippedArmorInstanceId: null,
      weaponName: "Fists", armorName: "None",
    };
  }
  const weaponCandidate = ITEMS[account.weapon_item_id];
  const armorCandidate = ITEMS[account.armor_item_id];
  const weapon = weaponCandidate?.type === "weapon" ? weaponCandidate : null;
  const armor = armorCandidate?.type === "armor" ? armorCandidate : null;
  const attack = weapon ? weapon.stat : 0;
  const defense = armor ? armor.stat : 0;
  return {
    balance: integer(account.balance, "balance"), attack, defense, totalPower: attack + defense,
    equippedWeaponInstanceId: account.equipped_weapon_id == null ? null : integer(account.equipped_weapon_id, "weapon instance ID"),
    equippedArmorInstanceId: account.equipped_armor_id == null ? null : integer(account.equipped_armor_id, "armor instance ID"),
    weaponName: weapon ? `${weapon.name} #${account.weapon_serial}` : "Fists",
    armorName: armor ? `${armor.name} #${account.armor_serial}` : "None",
  };
}

export async function buyItem(guildId, userId, itemId, quantity = 1) {
  const qty = positiveInteger(quantity);
  if (qty === null) return { success: false, reason: "invalid_quantity" };
  const item = ITEMS[itemId];
  if (!item) return { success: false, reason: "invalid_item" };
  const totalPrice = itemPrice(item) * qty;
  if (!Number.isSafeInteger(totalPrice)) return { success: false, reason: "invalid_quantity" };

  return transaction(async (client) => {
    const account = await lockAccount(client, guildId, userId, true);
    if (!account || integer(account.balance, "balance") < totalPrice) {
      return { success: false, reason: "insufficient_funds", price: totalPrice };
    }
    const { rows: updated } = await client.query(
      `UPDATE public.accounts SET balance = balance - $1
       WHERE guild_id = $2 AND user_id = $3 AND balance >= $1 RETURNING balance`,
      [totalPrice, guildId, userId]
    );
    if (!updated[0]) throw new Error("Could not deduct the purchase price.");

    const { rows } = await client.query(
      `SELECT serial_number FROM public.user_items
       WHERE guild_id = $1 AND user_id = $2 AND item_id = $3 ORDER BY serial_number ASC`,
      [guildId, userId, itemId]
    );
    const used = new Set(rows.map((row) => integer(row.serial_number, "serial number")));
    const addedItems = [];
    let nextSerial = 1;
    for (let i = 0; i < qty; i += 1) {
      while (used.has(nextSerial)) nextSerial += 1;
      integer(nextSerial, "serial number");
      const { rows: inserted } = await client.query(
        `INSERT INTO public.user_items (guild_id, user_id, item_id, serial_number)
         VALUES ($1, $2, $3, $4) RETURNING id, serial_number`,
        [guildId, userId, itemId, nextSerial]
      );
      addedItems.push(decodeItem(inserted[0]));
      used.add(nextSerial);
    }
    return {
      success: true, item: item.name, price: totalPrice, quantity: qty, addedItems,
      newBalance: integer(updated[0].balance, "balance"),
    };
  });
}

export async function sellItemBySerial(guildId, userId, itemId, serialNumber) {
  const item = ITEMS[itemId];
  if (!item) return { success: false, reason: "invalid_item" };
  const serial = positiveInteger(serialNumber);
  if (serial === null) return { success: false, reason: "not_owned" };
  const sellPrice = Math.floor(itemPrice(item) * 0.5);

  return transaction(async (client) => {
    const account = await lockAccount(client, guildId, userId);
    if (!account) return { success: false, reason: "not_owned" };
    const itemRow = await ownedItem(client, guildId, userId, itemId, serial);
    if (!itemRow) return { success: false, reason: "not_owned" };

    // Credit and unequip together, then remove the instance.
    const { rows } = await client.query(
      `UPDATE public.accounts
       SET balance = balance + $1,
           equipped_weapon_id = CASE WHEN equipped_weapon_id = $2 THEN NULL ELSE equipped_weapon_id END,
           equipped_armor_id = CASE WHEN equipped_armor_id = $2 THEN NULL ELSE equipped_armor_id END
       WHERE guild_id = $3 AND user_id = $4 AND balance <= $5 RETURNING balance`,
      [sellPrice, itemRow.id, guildId, userId, MAX_INTEGER - sellPrice]
    );
    if (!rows[0]) return { success: false, reason: "balance_limit" };
    const removed = await client.query(
      `DELETE FROM public.user_items
       WHERE id = $1 AND guild_id = $2 AND user_id = $3 RETURNING id`,
      [itemRow.id, guildId, userId]
    );
    if (removed.rows.length !== 1) throw new Error("Item changed during the sale. Try again.");
    return {
      success: true, item: `${item.name} #${itemRow.serial_number}`, price: sellPrice,
      newBalance: integer(rows[0].balance, "balance"),
    };
  });
}

export async function equipItemBySerial(guildId, userId, itemId, serialNumber) {
  const item = ITEMS[itemId];
  if (!item) return { success: false, reason: "invalid_item" };
  if (!["weapon", "armor"].includes(item.type)) return { success: false, reason: "invalid_type" };
  const serial = positiveInteger(serialNumber);
  if (serial === null) return { success: false, reason: "not_owned" };
  return transaction(async (client) => {
    await lockAccount(client, guildId, userId, true);
    const itemRow = await ownedItem(client, guildId, userId, itemId, serial);
    if (!itemRow) return { success: false, reason: "not_owned" };
    // Column names come only from this fixed allowlist.
    const column = item.type === "weapon" ? "equipped_weapon_id" : "equipped_armor_id";
    await client.query(
      `UPDATE public.accounts SET ${column} = $1 WHERE guild_id = $2 AND user_id = $3`,
      [itemRow.id, guildId, userId]
    );
    return { success: true, item, serialNumber: itemRow.serial_number };
  });
}

export async function unequipItemBySerial(guildId, userId, target, serialNumber) {
  const item = ITEMS[target];
  const targetType = item ? item.type : target;
  if (!["weapon", "armor"].includes(targetType)) return { success: false, reason: "invalid_type" };
  return transaction(async (client) => {
    const account = await lockAccount(client, guildId, userId);
    const column = targetType === "weapon" ? "equipped_weapon_id" : "equipped_armor_id";
    if (!account || account[column] == null) return { success: false, reason: "nothing_equipped" };
    const hasSerial = serialNumber !== undefined && serialNumber !== null && serialNumber !== "";
    let uItem;
    if (hasSerial) {
      const serial = positiveInteger(serialNumber);
      if (serial === null || !item) return { success: false, reason: "not_equipped" };
      const row = await ownedItem(client, guildId, userId, target, serial);
      if (!row || row.id !== integer(account[column], "equipped instance ID")) {
        return { success: false, reason: "not_equipped" };
      }
      uItem = item;
    } else {
      const { rows } = await client.query(
        `SELECT item_id FROM public.user_items
         WHERE id = $1 AND guild_id = $2 AND user_id = $3`,
        [account[column], guildId, userId]
      );
      uItem = rows[0] ? ITEMS[rows[0].item_id] ?? null : null;
    }
    await client.query(
      `UPDATE public.accounts SET ${column} = NULL WHERE guild_id = $1 AND user_id = $2`,
      [guildId, userId]
    );
    return { success: true, item: uItem };
  });
}
