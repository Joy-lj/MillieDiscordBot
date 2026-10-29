import db from "./connection.js";

export function initializePets() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS pets (
      guild_id TEXT,
      user_id TEXT,
      pet_type TEXT,
      stage INTEGER DEFAULT 1,
      xp INTEGER DEFAULT 0,
      last_fed_at INTEGER DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS pet_food (
      guild_id TEXT,
      user_id TEXT,
      food_count INTEGER DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    )
  `).run();
}

export function claimUserPet(guildId, userId, petType) {
  return db.transaction(() => {
    const existing = db.prepare(`
      SELECT pet_type FROM pets WHERE guild_id = ? AND user_id = ?
    `).get(guildId, userId);

    if (existing) {
      return { success: false, reason: "already_claimed", petType: existing.pet_type };
    }

    db.prepare(`
      INSERT INTO pets (guild_id, user_id, pet_type, stage, xp, last_fed_at)
      VALUES (?, ?, ?, 1, 0, 0)
    `).run(guildId, userId, petType);

    return { success: true, petType };
  }).immediate();
}

export function getPet(guildId, userId) {
  return db.prepare(`
    SELECT * FROM pets WHERE guild_id = ? AND user_id = ?
  `).get(guildId, userId);
}

export function getPetFood(guildId, userId) {
  const row = db.prepare(`
    SELECT food_count FROM pet_food WHERE guild_id = ? AND user_id = ?
  `).get(guildId, userId);
  return row ? row.food_count : 0;
}

export function buyPetFood(guildId, userId, cost = 50) {
  return db.transaction(() => {
    const account = db.prepare(`
      SELECT balance FROM accounts WHERE guild_id = ? AND user_id = ?
    `).get(guildId, userId);

    if (!account || account.balance < cost) {
      return { success: false, reason: "insufficient_funds", cost };
    }

    db.prepare(`
      UPDATE accounts SET balance = balance - ? WHERE guild_id = ? AND user_id = ?
    `).run(cost, guildId, userId);

    db.prepare(`
      INSERT INTO pet_food (guild_id, user_id, food_count)
      VALUES (?, ?, 1)
      ON CONFLICT (guild_id, user_id) DO UPDATE SET food_count = food_count + 1
    `).run(guildId, userId);

    const newFoodCount = getPetFood(guildId, userId);
    return { success: true, cost, newBalance: account.balance - cost, foodCount: newFoodCount };
  }).immediate();
}

export function feedUserPet(guildId, userId) {
  const cooldown = 60 * 60 * 1000; // 1 hour

  return db.transaction(() => {
    const pet = db.prepare(`
      SELECT * FROM pets WHERE guild_id = ? AND user_id = ?
    `).get(guildId, userId);

    if (!pet) {
      return { success: false, reason: "no_pet" };
    }

    const foodCount = getPetFood(guildId, userId);
    if (foodCount <= 0) {
      return { success: false, reason: "no_food" };
    }

    const now = Date.now();
    const nextFeedAt = pet.last_fed_at + cooldown;
    if (pet.last_fed_at !== 0 && now < nextFeedAt) {
      return { success: false, reason: "cooldown", nextFeedAt };
    }

    // Consume 1 food
    db.prepare(`
      UPDATE pet_food SET food_count = food_count - 1 WHERE guild_id = ? AND user_id = ?
    `).run(guildId, userId);

    // Update XP and check evolution stages (Stage 1 -> 2 at 100 XP, Stage 2 -> 3 at 250 XP)
    let newXp = pet.xp + 25;
    let newStage = pet.stage;
    let evolved = false;

    if (newStage === 1 && newXp >= 100) {
      newStage = 2;
      evolved = true;
    } else if (newStage === 2 && newXp >= 250) {
      newStage = 3;
      evolved = true;
    }

    db.prepare(`
      UPDATE pets SET xp = ?, stage = ?, last_fed_at = ? WHERE guild_id = ? AND user_id = ?
    `).run(newXp, newStage, now, guildId, userId);

    return {
      success: true,
      petType: pet.pet_type,
      stage: newStage,
      xp: newXp,
      evolved,
      remainingFood: foodCount - 1
    };
  }).immediate();
} 