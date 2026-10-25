import db from "./connection.js";

export const ITEMS = {
  // Weapons (Strength stat)
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
  
  // Armor (Defense stat)
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
    SELECT item_id, quantity FROM inventory
    WHERE guild_id = ? AND user_id = ? AND quantity > 0
  `).all(guildId, userId);
}

export function getEquippedItems(guildId, userId) {
  const account = db.prepare(`
    SELECT equipped_weapon, equipped_armor FROM accounts
    WHERE guild_id = ? AND user_id = ?
  `).get(guildId, userId);

  return {
    weapon: account?.equipped_weapon ? ITEMS[account.equipped_weapon] : null,
    weaponId: account?.equipped_weapon || null,
    armor: account?.equipped_armor ? ITEMS[account.equipped_armor] : null,
    armorId: account?.equipped_armor || null,
  };
}

export function equipItem(guildId, userId, itemId) {
  const item = ITEMS[itemId];
  if (!item) return { success: false, reason: "invalid_item" };

  return db.transaction(() => {
    // Make sure account exists
    db.prepare(`
      INSERT INTO accounts (guild_id, user_id) VALUES (?, ?)
      ON CONFLICT (guild_id, user_id) DO NOTHING
    `).run(guildId, userId);

    // Check if user owns the item
    const owned = db.prepare(`
      SELECT quantity FROM inventory
      WHERE guild_id = ? AND user_id = ? AND item_id = ?
    `).get(guildId, userId, itemId);

    if (!owned || owned.quantity <= 0) {
      return { success: false, reason: "not_owned" };
    }

    // Equip based on item type
    if (item.type === "weapon") {
      db.prepare(`
        UPDATE accounts SET equipped_weapon = ?
        WHERE guild_id = ? AND user_id = ?
      `).run(itemId, guildId, userId);
    } else if (item.type === "armor") {
      db.prepare(`
        UPDATE accounts SET equipped_armor = ?
        WHERE guild_id = ? AND user_id = ?
      `).run(itemId, guildId, userId);
    }

    return { success: true, item };
  }).immediate();
}

// Purchase an item (deducts coins and adds to inventory in a single transaction)
export function buyItem(guildId, userId, itemId) {
  const item = ITEMS[itemId];
  if (!item) return { success: false, reason: "invalid_item" };

  const purchase = db.transaction(() => {
    // Check user balance
    const account = db.prepare(`
      SELECT balance FROM accounts
      WHERE guild_id = ? AND user_id = ?
    `).get(guildId, userId);

    if (!account || account.balance < item.price) {
      return { success: false, reason: "insufficient_funds", price: item.price };
    }

    // Deduct coins
    db.prepare(`
      UPDATE accounts SET balance = balance - ?
      WHERE guild_id = ? AND user_id = ?
    `).run(item.price, guildId, userId);

    // Add item to inventory (or increment quantity)
    db.prepare(`
      INSERT INTO inventory (guild_id, user_id, item_id, quantity)
      VALUES (?, ?, ?, 1)
      ON CONFLICT (guild_id, user_id, item_id)
      DO UPDATE SET quantity = quantity + 1
    `).run(guildId, userId, itemId);

    return { success: true, item: item.name, price: item.price, newBalance: account.balance - item.price };
  });

  return purchase.immediate();
}

// Sell an item back for its purchase price
export function sellItem(guildId, userId, itemId, amount = 1) {
  // 1. Fetch item details from your ITEMS manifest
  const item = ITEMS[itemId];
  if (!item) throw new Error("Item does not exist.");

  // 2. Run transaction atomically
  return db.transaction(() => {
    // Check user's current item quantity
    const invRow = db
      .prepare(`SELECT quantity FROM inventory WHERE guild_id = ? AND user_id = ? AND item_id = ?`)
      .get(guildId, userId, itemId);

    if (!invRow || invRow.quantity < amount) {
      throw new Error("You do not have enough of this item to sell!");
    }

    // Check equipped status from user's equipment table/columns
    const equipRow = db
      .prepare(`SELECT equipped_weapon, equipped_armor FROM user_equipment WHERE guild_id = ? AND user_id = ?`)
      .get(guildId, userId);

    // If selling down to 0, check if it's currently equipped and unequip it
    const remainingQty = invRow.quantity - amount;

    if (remainingQty <= 0) {
      if (equipRow) {
        if (equipRow.equipped_weapon === itemId) {
          db.prepare(`UPDATE user_equipment SET equipped_weapon = NULL WHERE guild_id = ? AND user_id = ?`).run(guildId, userId);
        }
        if (equipRow.equipped_armor === itemId) {
          db.prepare(`UPDATE user_equipment SET equipped_armor = NULL WHERE guild_id = ? AND user_id = ?`).run(guildId, userId);
        }
      }

      // Remove from inventory
      db.prepare(`DELETE FROM inventory WHERE guild_id = ? AND user_id = ? AND item_id = ?`).run(guildId, userId, itemId);
    } else {
      // Reduce item count
      db.prepare(`UPDATE inventory SET quantity = quantity - ? WHERE guild_id = ? AND user_id = ? AND item_id = ?`).run(amount, guildId, userId, itemId);
    }

    // 3. Credit cookies/currency back to user account
    const totalEarnings = item.price * amount;
    db.prepare(`UPDATE accounts SET balance = balance + ? WHERE guild_id = ? AND user_id = ?`).run(totalEarnings, guildId, userId);

    return { totalEarnings, remainingQty };
  })();
}

export function unequipItem(guildId, userId, itemType) {
  if (!["weapon", "armor"].includes(itemType)) {
    return { success: false, reason: "invalid_type" };
  }

  const column = itemType === "weapon" ? "equipped_weapon" : "equipped_armor";

  return db.transaction(() => {
    // Check what is currently equipped
    const account = db.prepare(`
      SELECT ${column} FROM accounts
      WHERE guild_id = ? AND user_id = ?
    `).get(guildId, userId);

    if (!account || !account[column]) {
      return { success: false, reason: "nothing_equipped" };
    }

    const unequippedItemId = account[column];
    const itemInfo = ITEMS[unequippedItemId];

    // Clear the equipped slot
    db.prepare(`
      UPDATE accounts SET ${column} = NULL
      WHERE guild_id = ? AND user_id = ?
    `).run(guildId, userId);

    return { success: true, item: itemInfo };
  }).immediate();
}

// Add this helper function to database/items.js
export function getUserCombatStats(guildId, userId) {
  const account = db.prepare(`
    SELECT balance, equipped_weapon, equipped_armor FROM accounts
    WHERE guild_id = ? AND user_id = ?
  `).get(guildId, userId);

  if (!account) return { balance: 0, attack: 0, defense: 0, totalPower: 0 };

  const weapon = account.equipped_weapon ? ITEMS[account.equipped_weapon] : null;
  const armor = account.equipped_armor ? ITEMS[account.equipped_armor] : null;

  const attack = weapon ? weapon.stat : 0;
  const defense = armor ? armor.stat : 0;
  const totalPower = attack + defense;

  return {
    balance: account.balance,
    attack,
    defense,
    totalPower,
    weaponName: weapon ? weapon.name : "Fists",
    armorName: armor ? armor.name : "None",
  };
}