import db from "./connection.js";
import { ITEMS } from "../config/items.js";

// Preserve imports used by existing commands.
export { ITEMS };

export function getUserInventory(guildId, userId) {
  return db.prepare(`
    SELECT id, item_id, serial_number FROM user_items
    WHERE guild_id = ? AND user_id = ?
    ORDER BY item_id, serial_number ASC
  `).all(guildId, userId);
}

export function getUserCombatStats(guildId, userId) {
  const account = db.prepare(`
    SELECT balance, equipped_weapon_id, equipped_armor_id FROM accounts
    WHERE guild_id = ? AND user_id = ?
  `).get(guildId, userId);

  if (!account) {
    return {
      balance: 0,
      attack: 0,
      defense: 0,
      totalPower: 0,
      equippedWeaponInstanceId: null,
      equippedArmorInstanceId: null,
      weaponName: "Fists",
      armorName: "None",
    };
  }

  let weapon = null;
  let weaponName = "Fists";
  if (account.equipped_weapon_id) {
    const wRow = db.prepare(`SELECT item_id, serial_number FROM user_items WHERE id = ?`).get(account.equipped_weapon_id);
    if (wRow && ITEMS[wRow.item_id]) {
      weapon = ITEMS[wRow.item_id];
      weaponName = `${weapon.name} #${wRow.serial_number}`;
    }
  }

  let armor = null;
  let armorName = "None";
  if (account.equipped_armor_id) {
    const aRow = db.prepare(`SELECT item_id, serial_number FROM user_items WHERE id = ?`).get(account.equipped_armor_id);
    if (aRow && ITEMS[aRow.item_id]) {
      armor = ITEMS[aRow.item_id];
      armorName = `${armor.name} #${aRow.serial_number}`;
    }
  }

  const attack = weapon ? weapon.stat : 0;
  const defense = armor ? armor.stat : 0;

  return {
    balance: account.balance,
    attack,
    defense,
    totalPower: attack + defense,
    equippedWeaponInstanceId: account.equipped_weapon_id || null,
    equippedArmorInstanceId: account.equipped_armor_id || null,
    weaponName,
    armorName,
  };
}

export function buyItem(guildId, userId, itemId, quantity = 1) {
  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || qty <= 0) return { success: false, reason: "invalid_quantity" };

  const item = ITEMS[itemId];
  if (!item) return { success: false, reason: "invalid_item" };

  const totalPrice = item.price * qty;

  return db.transaction(() => {
    db.prepare(`
      INSERT INTO accounts (guild_id, user_id) VALUES (?, ?)
      ON CONFLICT (guild_id, user_id) DO NOTHING
    `).run(guildId, userId);

    const account = db.prepare(`SELECT balance FROM accounts WHERE guild_id = ? AND user_id = ?`).get(guildId, userId);
    if (!account || account.balance < totalPrice) {
      return { success: false, reason: "insufficient_funds", price: totalPrice };
    }

    db.prepare(`UPDATE accounts SET balance = balance - ? WHERE guild_id = ? AND user_id = ?`).run(totalPrice, guildId, userId);

    const addedItems = [];

    // Fills gaps in serial numbers first before incrementing
    for (let i = 0; i < qty; i++) {
      const existingSerials = db.prepare(`
        SELECT serial_number FROM user_items
        WHERE guild_id = ? AND user_id = ? AND item_id = ?
        ORDER BY serial_number ASC
      `).all(guildId, userId, itemId).map(r => r.serial_number);

      let nextSerial = 1;
      for (const s of existingSerials) {
        if (s === nextSerial) {
          nextSerial++;
        } else {
          break;
        }
      }

      const info = db.prepare(`
        INSERT INTO user_items (guild_id, user_id, item_id, serial_number)
        VALUES (?, ?, ?, ?)
        RETURNING id, serial_number
      `).get(guildId, userId, itemId, nextSerial);
      addedItems.push(info);
    }

    return {
      success: true,
      item: item.name,
      price: totalPrice,
      quantity: qty,
      addedItems,
      newBalance: account.balance - totalPrice,
    };
  }).immediate();
}

export function sellItemBySerial(guildId, userId, itemId, serialNumber) {
  const item = ITEMS[itemId];
  if (!item) return { success: false, reason: "invalid_item" };

  return db.transaction(() => {
    const itemRow = db.prepare(`
      SELECT id, item_id, serial_number FROM user_items
      WHERE guild_id = ? AND user_id = ? AND item_id = ? AND serial_number = ?
    `).get(guildId, userId, itemId, serialNumber);

    if (!itemRow) {
      return { success: false, reason: "not_owned" };
    }

    const sellPrice = Math.floor(item.price * 0.5);

    const account = db.prepare(`SELECT equipped_weapon_id, equipped_armor_id FROM accounts WHERE guild_id = ? AND user_id = ?`).get(guildId, userId);
    if (account?.equipped_weapon_id === itemRow.id) {
      db.prepare(`UPDATE accounts SET equipped_weapon_id = NULL WHERE guild_id = ? AND user_id = ?`).run(guildId, userId);
    }
    if (account?.equipped_armor_id === itemRow.id) {
      db.prepare(`UPDATE accounts SET equipped_armor_id = NULL WHERE guild_id = ? AND user_id = ?`).run(guildId, userId);
    }

    db.prepare(`DELETE FROM user_items WHERE id = ?`).run(itemRow.id);

    const updated = db.prepare(`
      UPDATE accounts SET balance = balance + ?
      WHERE guild_id = ? AND user_id = ?
      RETURNING balance
    `).get(sellPrice, guildId, userId);

    return {
      success: true,
      item: `${item.name} #${itemRow.serial_number}`,
      price: sellPrice,
      newBalance: updated.balance,
    };
  }).immediate();
}

export function equipItemBySerial(guildId, userId, itemId, serialNumber) {
  const item = ITEMS[itemId];
  if (!item) return { success: false, reason: "invalid_item" };

  return db.transaction(() => {
    const itemRow = db.prepare(`
      SELECT id, item_id, serial_number FROM user_items
      WHERE guild_id = ? AND user_id = ? AND item_id = ? AND serial_number = ?
    `).get(guildId, userId, itemId, serialNumber);

    if (!itemRow) {
      return { success: false, reason: "not_owned" };
    }

    db.prepare(`
      INSERT INTO accounts (guild_id, user_id) VALUES (?, ?)
      ON CONFLICT (guild_id, user_id) DO NOTHING
    `).run(guildId, userId);

    if (item.type === "weapon") {
      db.prepare(`UPDATE accounts SET equipped_weapon_id = ? WHERE guild_id = ? AND user_id = ?`).run(itemRow.id, guildId, userId);
    } else if (item.type === "armor") {
      db.prepare(`UPDATE accounts SET equipped_armor_id = ? WHERE guild_id = ? AND user_id = ?`).run(itemRow.id, guildId, userId);
    }

    return { success: true, item, serialNumber: itemRow.serial_number };
  }).immediate();
}

export function unequipItemBySerial(guildId, userId, target, serialNumber) {
  const item = ITEMS[target];
  const targetType = item ? item.type : target;

  return db.transaction(() => {
    const account = db.prepare(`SELECT equipped_weapon_id, equipped_armor_id FROM accounts WHERE guild_id = ? AND user_id = ?`).get(guildId, userId);
    if (!account) return { success: false, reason: "nothing_equipped" };

    if ((targetType === "weapon" || targetType === "armor") && serialNumber) {
      const col = targetType === "weapon" ? "equipped_weapon_id" : "equipped_armor_id";
      const uRow = db.prepare(`SELECT id FROM user_items WHERE id = ? AND item_id = ? AND serial_number = ?`).get(account[col], target, serialNumber);
      if (uRow) {
        db.prepare(`UPDATE accounts SET ${col} = NULL WHERE guild_id = ? AND user_id = ?`).run(guildId, userId);
        return { success: true, item };
      }
      return { success: false, reason: "not_equipped" };
    } else if (targetType === "weapon" || targetType === "armor") {
      const column = targetType === "weapon" ? "equipped_weapon_id" : "equipped_armor_id";
      if (!account[column]) return { success: false, reason: "nothing_equipped" };
      
      const uRow = db.prepare(`SELECT item_id FROM user_items WHERE id = ?`).get(account[column]);
      const uItem = uRow ? ITEMS[uRow.item_id] : null;

      db.prepare(`UPDATE accounts SET ${column} = NULL WHERE guild_id = ? AND user_id = ?`).run(guildId, userId);
      return { success: true, item: uItem };
    }

    return { success: false, reason: "invalid_type" };
  }).immediate();
}
