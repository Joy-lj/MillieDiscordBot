import db from "./connection.js";

export const ITEMS = {
  "foam-sword": {
    name: "Foam Sword",
    type: "weapon",
    stat: 5,
    price: 150,
    description: "A harmless children's toy made of soft foam.",
    use: "Tickle opponents or practice swinging safely."
  },
  "rusty-shank": {
    name: "Rusty Shank",
    type: "weapon",
    stat: 12,
    price: 300,
    description: "A jagged, tetanus-ridden piece of metal.",
    use: "Stab targets in close-quarters combat."
  },
  "beer-bottle": {
    name: "Beer Bottle",
    type: "weapon",
    stat: 20,
    price: 500,
    description: "Half-empty glass bottle with a jagged edge.",
    use: "Smash over foes or drink when thirsty."
  },
  "gun": {
    name: "Gun",
    type: "weapon",
    stat: 100,
    price: 2500,
    description: "A standard firearm loaded with cookie shrapnel.",
    use: "Shoot targets from a distance."
  },
  "bicycle-helmet": {
    name: "Bicycle Helmet",
    type: "armor",
    stat: 10,
    price: 200,
    description: "A plastic helmet meant for safety on wheels.",
    use: "Protects your head from bumps and strikes."
  },
  "padded-pants": {
    name: "Padded Pants",
    type: "armor",
    stat: 25,
    price: 400,
    description: "Thick cotton pants stuffed with old rags.",
    use: "Cushions falls and light blows."
  },
  "chainmail-shirt": {
    name: "Chainmail Shirt",
    type: "armor",
    stat: 60,
    price: 1200,
    description: "Interlocking metal rings woven together.",
    use: "Deflects sharp strikes and slashes."
  },
  "bulletproof-vest": {
    name: "Bulletproof Vest",
    type: "armor",
    stat: 150,
    price: 3500,
    description: "Heavy-duty Kevlar vest built for survival.",
    use: "Stops high-velocity impacts and heavy hits."
  }
};

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

    const maxSerialRow = db.prepare(`
      SELECT MAX(serial_number) as max_serial FROM user_items
      WHERE guild_id = ? AND user_id = ? AND item_id = ?
    `).get(guildId, userId, itemId);

    let nextSerial = (maxSerialRow?.max_serial || 0);
    const addedItems = [];

    for (let i = 0; i < qty; i++) {
      nextSerial++;
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

export function sellItemInstance(guildId, userId, itemInstanceId) {
  return db.transaction(() => {
    const itemRow = db.prepare(`
      SELECT id, item_id, serial_number FROM user_items
      WHERE id = ? AND guild_id = ? AND user_id = ?
    `).get(itemInstanceId, guildId, userId);

    if (!itemRow) {
      return { success: false, reason: "not_owned" };
    }

    const item = ITEMS[itemRow.item_id];
    const sellPrice = Math.floor(item.price * 0.5);

    const account = db.prepare(`SELECT equipped_weapon_id, equipped_armor_id FROM accounts WHERE guild_id = ? AND user_id = ?`).get(guildId, userId);
    if (account?.equipped_weapon_id === itemInstanceId) {
      db.prepare(`UPDATE accounts SET equipped_weapon_id = NULL WHERE guild_id = ? AND user_id = ?`).run(guildId, userId);
    }
    if (account?.equipped_armor_id === itemInstanceId) {
      db.prepare(`UPDATE accounts SET equipped_armor_id = NULL WHERE guild_id = ? AND user_id = ?`).run(guildId, userId);
    }

    db.prepare(`DELETE FROM user_items WHERE id = ?`).run(itemInstanceId);

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

export function equipItemInstance(guildId, userId, itemInstanceId) {
  return db.transaction(() => {
    const itemRow = db.prepare(`
      SELECT id, item_id, serial_number FROM user_items
      WHERE id = ? AND guild_id = ? AND user_id = ?
    `).get(itemInstanceId, guildId, userId);

    if (!itemRow) {
      return { success: false, reason: "not_owned" };
    }

    const item = ITEMS[itemRow.item_id];

    db.prepare(`
      INSERT INTO accounts (guild_id, user_id) VALUES (?, ?)
      ON CONFLICT (guild_id, user_id) DO NOTHING
    `).run(guildId, userId);

    if (item.type === "weapon") {
      db.prepare(`UPDATE accounts SET equipped_weapon_id = ? WHERE guild_id = ? AND user_id = ?`).run(itemInstanceId, guildId, userId);
    } else if (item.type === "armor") {
      db.prepare(`UPDATE accounts SET equipped_armor_id = ? WHERE guild_id = ? AND user_id = ?`).run(itemInstanceId, guildId, userId);
    }

    return { success: true, item, serialNumber: itemRow.serial_number };
  }).immediate();
}

export function unequipItem(guildId, userId, targetType) {
  if (!["weapon", "armor"].includes(targetType)) {
    return { success: false, reason: "invalid_type" };
  }

  const column = targetType === "weapon" ? "equipped_weapon_id" : "equipped_armor_id";

  return db.transaction(() => {
    const account = db.prepare(`SELECT ${column} FROM accounts WHERE guild_id = ? AND user_id = ?`).get(guildId, userId);
    if (!account || !account[column]) {
      return { success: false, reason: "nothing_equipped" };
    }

    db.prepare(`UPDATE accounts SET ${column} = NULL WHERE guild_id = ? AND user_id = ?`).run(guildId, userId);

    return { success: true };
  }).immediate();
}