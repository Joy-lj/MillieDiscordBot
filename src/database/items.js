import { createHash } from "node:crypto";
import db from "./connection.js";
import { ITEMS } from "../config/items.js";

// Preserve existing command imports.
export { ITEMS };
const MAX_INTEGER = Number.MAX_SAFE_INTEGER;
const MAX_QUANTITY = 100;
export const EQUIPMENT_SLOTS = [
  "main_hand", "off_hand", "head", "torso", "legs", "hands",
  "feet", "cape", "neck", "ring", "ammo",
];
const slotAliases = {
  weapon: "main_hand", armor: "torso", mainhand: "main_hand",
  offhand: "off_hand", helmet: "head", necklace: "neck",
};
const definition = (id) => Object.hasOwn(ITEMS, id) ? ITEMS[id] : null;
const slotFor = (item) => EQUIPMENT_SLOTS.includes(item?.slot) ? item.slot : null;


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
    `SELECT id, item_id, serial_number, is_locked FROM public.user_items
     WHERE guild_id = $1 AND user_id = $2 AND item_id = $3 AND serial_number = $4`,
    [guildId, userId, itemId, serialNumber]
  );
  return rows[0] ? decodeItem(rows[0]) : null;
}

export async function getUserInventory(guildId, userId) {
  const { rows } = await db.query(
    `SELECT id, item_id, serial_number, is_locked FROM public.user_items
     WHERE guild_id = $1 AND user_id = $2 ORDER BY item_id, serial_number ASC`,
    [guildId, userId]
  );
  return rows.map(decodeItem);
}

async function syncLegacyEquipment(client, guildId, userId) {
  await client.query(
    `UPDATE public.accounts AS a
     SET equipped_weapon_id = (
       SELECT item_instance_id FROM public.user_equipment
       WHERE guild_id = a.guild_id AND user_id = a.user_id AND slot = 'main_hand'
     ), equipped_armor_id = (
       SELECT item_instance_id FROM public.user_equipment
       WHERE guild_id = a.guild_id AND user_id = a.user_id AND slot = 'torso'
     )
     WHERE a.guild_id = $1 AND a.user_id = $2`,
    [guildId, userId]
  );
}

export async function getUserCombatStats(guildId, userId) {
  const { rows } = await db.query(
    `SELECT a.balance, e.slot, i.id, i.item_id, i.serial_number
     FROM public.accounts a
     LEFT JOIN public.user_equipment e
       ON e.guild_id = a.guild_id AND e.user_id = a.user_id
     LEFT JOIN public.user_items i
       ON i.id = e.item_instance_id
       AND i.guild_id = a.guild_id AND i.user_id = a.user_id
     WHERE a.guild_id = $1 AND a.user_id = $2`,
    [guildId, userId]
  );
  const equipment = {};
  const totals = { attack: 0, defense: 0, health: 0, speed: 0, critChance: 0 };
  for (const row of rows) {
    if (row.id == null) continue;
    const item = definition(row.item_id);
    if (!item || !slotFor(item) || item.slot !== row.slot) continue;
    equipment[row.slot] = {
      instanceId: integer(row.id, "item instance ID"),
      itemId: row.item_id,
      serialNumber: integer(row.serial_number, "serial number"),
      item,
    };
  }
  // A two-handed weapon cannot receive off-hand bonuses.
  if (equipment.main_hand?.item.handedness === 2) delete equipment.off_hand;
  for (const { item } of Object.values(equipment)) {
    for (const key of Object.keys(totals)) {
      const value = Number(item.stats?.[key] ?? 0);
      if (!Number.isFinite(value)) throw new Error(`Invalid item stat: ${key}.`);
      totals[key] += value;
      if (!Number.isFinite(totals[key])) throw new Error(`Equipment stat overflow: ${key}.`);
    }
  }
  const main = equipment.main_hand;
  const torso = equipment.torso;
  return {
    balance: rows[0] ? integer(rows[0].balance, "balance") : 0,
    ...totals,
    totalPower: totals.attack + totals.defense,
    healthBonus: totals.health,
    speedBonus: totals.speed,
    equipment,
    equippedInstanceIds: Object.values(equipment).map((entry) => entry.instanceId),
    ability: main?.item.dungeon?.ability ?? null,
    passives: Object.values(equipment)
      .map((entry) => entry.item.dungeon?.passive).filter(Boolean),
    // Compatibility fields; these represent main hand and torso only.
    equippedWeaponInstanceId: main?.instanceId ?? null,
    equippedArmorInstanceId: torso?.instanceId ?? null,
    weaponName: main ? `${main.item.name} #${main.serialNumber}` : "Fists",
    armorName: torso ? `${torso.item.name} #${torso.serialNumber}` : "None",
  };
}

export async function buyItem(guildId, userId, itemId, quantity = 1) {
  const qty = positiveInteger(quantity);
  if (qty === null || qty > MAX_QUANTITY) return { success: false, reason: "invalid_quantity" };
  const item = definition(itemId);
  if (!item) return { success: false, reason: "invalid_item" };
  if (item.purchasable === false || item.source === "dungeon") {
    return { success: false, reason: "dungeon_only" };
  }
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
  const item = definition(itemId);
  if (!item) return { success: false, reason: "invalid_item" };
  if (item.type === "material" || item.sellable === false) return { success: false, reason: "not_sellable" };
  const serial = positiveInteger(serialNumber);
  if (serial === null) return { success: false, reason: "not_owned" };
  const sellPrice = Math.floor(itemPrice(item) * 0.5);

  return transaction(async (client) => {
    const account = await lockAccount(client, guildId, userId);
    if (!account) return { success: false, reason: "not_owned" };
    const itemRow = await ownedItem(client, guildId, userId, itemId, serial);
    if (!itemRow) return { success: false, reason: "not_owned" };
    if (itemRow.is_locked) return { success: false, reason: "locked" };

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
    await client.query(
      `DELETE FROM public.user_equipment
       WHERE guild_id = $1 AND user_id = $2 AND item_instance_id = $3`,
      [guildId, userId, itemRow.id]
    );
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
  const item = definition(itemId);
  if (!item) return { success: false, reason: "invalid_item" };
  const slot = slotFor(item);
  if (!slot || !["weapon", "armor", "accessory"].includes(item.type)) {
    return { success: false, reason: "invalid_type" };
  }
  if (item.handedness === 2 && slot !== "main_hand") {
    throw new Error("Two-handed equipment must use the main-hand slot.");
  }
  const serial = positiveInteger(serialNumber);
  if (serial === null) return { success: false, reason: "not_owned" };
  return transaction(async (client) => {
    await lockAccount(client, guildId, userId, true);
    const owned = await ownedItem(client, guildId, userId, itemId, serial);
    if (!owned) return { success: false, reason: "not_owned" };
    if (slot === "off_hand") {
      const { rows } = await client.query(
        `SELECT i.item_id FROM public.user_equipment e
         JOIN public.user_items i ON i.id = e.item_instance_id
           AND i.guild_id = e.guild_id AND i.user_id = e.user_id
         WHERE e.guild_id = $1 AND e.user_id = $2 AND e.slot = 'main_hand'`,
        [guildId, userId]
      );
      if (definition(rows[0]?.item_id)?.handedness === 2) {
        return { success: false, reason: "two_handed_equipped" };
      }
    }
    let offHandUnequipped = false;
    if (slot === "main_hand" && item.handedness === 2) {
      const removed = await client.query(
        `DELETE FROM public.user_equipment
         WHERE guild_id = $1 AND user_id = $2 AND slot = 'off_hand'`,
        [guildId, userId]
      );
      offHandUnequipped = removed.rowCount > 0;
    }
    await client.query(
      `INSERT INTO public.user_equipment (guild_id, user_id, slot, item_instance_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (guild_id, user_id, slot)
       DO UPDATE SET item_instance_id = EXCLUDED.item_instance_id`,
      [guildId, userId, slot, owned.id]
    );
    await syncLegacyEquipment(client, guildId, userId);
    return {
      success: true, item, slot, serialNumber: owned.serial_number,
      instanceId: owned.id, offHandUnequipped,
    };
  });
}

export async function unequipItemBySerial(guildId, userId, target, serialNumber) {
  const normalized = String(target ?? "").trim().toLowerCase();
  const item = definition(normalized);
  const slot = item ? slotFor(item) : slotAliases[normalized] ?? normalized;
  if (!EQUIPMENT_SLOTS.includes(slot)) {
    return { success: false, reason: "invalid_type" };
  }
  // Older command parsers pass NaN when no serial argument is provided.
  const hasSerial = serialNumber !== undefined && serialNumber !== null &&
    serialNumber !== "" && !Number.isNaN(serialNumber);
  const serial = positiveInteger(serialNumber);
  // Item-specific removal requires a serial. Slot removal takes no serial.
  if ((item && serial === null) || (!item && hasSerial)) {
    return { success: false, reason: "not_equipped" };
  }
  return transaction(async (client) => {
    const account = await lockAccount(client, guildId, userId);
    if (!account) return { success: false, reason: "nothing_equipped" };
    const { rows } = await client.query(
      `SELECT e.item_instance_id, i.item_id, i.serial_number
       FROM public.user_equipment e
       JOIN public.user_items i ON i.id = e.item_instance_id
         AND i.guild_id = e.guild_id AND i.user_id = e.user_id
       WHERE e.guild_id = $1 AND e.user_id = $2 AND e.slot = $3`,
      [guildId, userId, slot]
    );
    const equipped = rows[0];
    if (!equipped) return { success: false, reason: "nothing_equipped" };
    if (item && (equipped.item_id !== normalized ||
      integer(equipped.serial_number, "serial number") !== serial)) {
      return { success: false, reason: "not_equipped" };
    }
    await client.query(
      `DELETE FROM public.user_equipment
       WHERE guild_id = $1 AND user_id = $2 AND slot = $3`,
      [guildId, userId, slot]
    );
    await syncLegacyEquipment(client, guildId, userId);
    return {
      success: true, item: definition(equipped.item_id), slot,
      serialNumber: integer(equipped.serial_number, "serial number"),
    };
  });
}

// Favorites protect individual copies from sales, including the existing !sell path.
export async function setItemLocked(guildId, userId, instanceId, locked) {
  const id = positiveInteger(instanceId);
  if (id === null || typeof locked !== "boolean") return { success: false, reason: "invalid_item" };
  return transaction(async client => {
    if (!await lockAccount(client, guildId, userId)) return { success: false, reason: "not_owned" };
    const { rows } = await client.query(
      `UPDATE public.user_items SET is_locked = $1
       WHERE guild_id = $2 AND user_id = $3 AND id = $4
       RETURNING id, item_id, serial_number, is_locked`,
      [locked, guildId, userId, id]
    );
    return rows[0] ? { success: true, item: decodeItem(rows[0]) } : { success: false, reason: "not_owned" };
  });
}

function buildSalePlan(rows, equippedIds, mode, instanceId, guildId, userId) {
  if (!["one", "duplicates"].includes(mode)) throw new Error("Invalid sale mode.");
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.item_id)) groups.set(row.item_id, []);
    groups.get(row.item_id).push(row);
  }
  const sale = [];
  for (const [itemId, copies] of groups) {
    const item = definition(itemId);
    if (!item || item.sellable === false || !Number.isSafeInteger(item.price) || item.price < 1) continue;
    const price = Math.floor(item.price * 0.5);
    if (price < 1) continue;
    copies.sort((a, b) => Number(a.serial_number) - Number(b.serial_number));
    const protectedCopy = row => row.is_locked || equippedIds.has(String(row.id));
    const kept = mode === "duplicates" && !copies.some(protectedCopy) ? String(copies[0].id) : null;
    for (const row of copies) {
      if (protectedCopy(row)) continue;
      if (mode === "one" ? String(row.id) !== String(instanceId) : String(row.id) === kept) continue;
      sale.push({ id: integer(row.id, "item instance ID"), itemId, serialNumber: integer(row.serial_number, "serial number"), name: item.name, price });
    }
  }
  sale.sort((a, b) => a.id - b.id);
  const total = sale.reduce((sum, item) => sum + item.price, 0);
  if (!Number.isSafeInteger(total)) throw new Error("Sale total exceeds the supported limit.");
  const quote = createHash("sha256").update(JSON.stringify({
    guildId, userId, mode, instanceId: mode === "one" ? String(instanceId) : null,
    sale: sale.map(({ id, itemId, serialNumber, price }) => ({ id, itemId, serialNumber, price }))
  })).digest("hex");
  return { mode, instanceId: mode === "one" ? String(instanceId) : null, items: sale, count: sale.length, total, quote };
}

async function saleInventory(client, guildId, userId, account) {
  const { rows } = await client.query(
    `SELECT id, item_id, serial_number, is_locked FROM public.user_items
     WHERE guild_id = $1 AND user_id = $2 ORDER BY item_id, serial_number`,
    [guildId, userId]
  );
  const { rows: equipped } = await client.query(
    `SELECT item_instance_id FROM public.user_equipment WHERE guild_id = $1 AND user_id = $2`,
    [guildId, userId]
  );
  const ids = new Set(equipped.map(row => String(row.item_instance_id)));
  // Protect legacy equipped pointers as well during the equipment transition.
  for (const id of [account.equipped_weapon_id, account.equipped_armor_id]) if (id != null) ids.add(String(id));
  return { rows, equippedIds: ids };
}

export async function previewItemSale(guildId, userId, mode = "duplicates", instanceId = null) {
  if (mode === "one" && positiveInteger(instanceId) === null) return { success: false, reason: "invalid_item" };
  return transaction(async client => {
    const account = await lockAccount(client, guildId, userId);
    if (!account) return { success: false, reason: "empty_sale" };
    const { rows, equippedIds } = await saleInventory(client, guildId, userId, account);
    const plan = buildSalePlan(rows, equippedIds, mode, instanceId, guildId, userId);
    return plan.count ? { success: true, ...plan } : { success: false, reason: "empty_sale" };
  });
}

export async function confirmItemSale(guildId, userId, mode, instanceId, expectedQuote) {
  if (typeof expectedQuote !== "string" || !/^[0-9a-f]{64}$/.test(expectedQuote)) return { success: false, reason: "stale_quote" };
  return transaction(async client => {
    const account = await lockAccount(client, guildId, userId);
    if (!account) return { success: false, reason: "empty_sale" };
    const { rows, equippedIds } = await saleInventory(client, guildId, userId, account);
    const plan = buildSalePlan(rows, equippedIds, mode, instanceId, guildId, userId);
    if (!plan.count || plan.quote !== expectedQuote) return { success: false, reason: "stale_quote" };
    const { rows: credited } = await client.query(
      `UPDATE public.accounts SET balance = balance + $1
       WHERE guild_id = $2 AND user_id = $3 AND balance <= $4 RETURNING balance`,
      [plan.total, guildId, userId, MAX_INTEGER - plan.total]
    );
    if (!credited[0]) return { success: false, reason: "balance_limit" };
    const deleted = await client.query(
      `DELETE FROM public.user_items WHERE guild_id = $1 AND user_id = $2
       AND id = ANY($3::bigint[]) AND is_locked = FALSE RETURNING id`,
      [guildId, userId, plan.items.map(item => item.id)]
    );
    if (deleted.rows.length !== plan.count) throw new Error("Inventory changed during the sale.");
    return { success: true, sold: plan.count, earned: plan.total, balance: integer(credited[0].balance, "balance") };
  });
}
