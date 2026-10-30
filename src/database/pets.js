// import db from "./connection.js";

// export function initializePets() {
//   db.prepare(`
//     CREATE TABLE IF NOT EXISTS pets (
//       guild_id TEXT,
//       user_id TEXT,
//       pet_type TEXT,
//       stage INTEGER DEFAULT 1,
//       xp INTEGER DEFAULT 0,
//       last_fed_at INTEGER DEFAULT 0,
//       PRIMARY KEY (guild_id, user_id)
//     )
//   `).run();

//   db.prepare(`
//     CREATE TABLE IF NOT EXISTS pet_food (
//       guild_id TEXT,
//       user_id TEXT,
//       food_count INTEGER DEFAULT 0,
//       PRIMARY KEY (guild_id, user_id)
//     )
//   `).run();
// }

// export function claimUserPet(guildId, userId, petType) {
//   return db.transaction(() => {
//     const existing = db.prepare(`
//       SELECT pet_type FROM pets WHERE guild_id = ? AND user_id = ?
//     `).get(guildId, userId);

//     if (existing) {
//       return { success: false, reason: "already_claimed", petType: existing.pet_type };
//     }

//     db.prepare(`
//       INSERT INTO pets (guild_id, user_id, pet_type, stage, xp, last_fed_at)
//       VALUES (?, ?, ?, 1, 0, 0)
//     `).run(guildId, userId, petType);

//     return { success: true, petType };
//   }).immediate();
// }

// export function getPet(guildId, userId) {
//   return db.prepare(`
//     SELECT * FROM pets WHERE guild_id = ? AND user_id = ?
//   `).get(guildId, userId);
// }

// export function getPetFood(guildId, userId) {
//   const row = db.prepare(`
//     SELECT food_count FROM pet_food WHERE guild_id = ? AND user_id = ?
//   `).get(guildId, userId);
//   return row ? row.food_count : 0;
// }

// export function buyPetFood(guildId, userId, cost = 50) {
//   return db.transaction(() => {
//     const account = db.prepare(`
//       SELECT balance FROM accounts WHERE guild_id = ? AND user_id = ?
//     `).get(guildId, userId);

//     if (!account || account.balance < cost) {
//       return { success: false, reason: "insufficient_funds", cost };
//     }

//     db.prepare(`
//       UPDATE accounts SET balance = balance - ? WHERE guild_id = ? AND user_id = ?
//     `).run(cost, guildId, userId);

//     db.prepare(`
//       INSERT INTO pet_food (guild_id, user_id, food_count)
//       VALUES (?, ?, 1)
//       ON CONFLICT (guild_id, user_id) DO UPDATE SET food_count = food_count + 1
//     `).run(guildId, userId);

//     const newFoodCount = getPetFood(guildId, userId);
//     return { success: true, cost, newBalance: account.balance - cost, foodCount: newFoodCount };
//   }).immediate();
// }

// export function feedUserPet(guildId, userId) {
//   const cooldown = 60 * 60 * 1000; // 1 hour

//   return db.transaction(() => {
//     const pet = db.prepare(`
//       SELECT * FROM pets WHERE guild_id = ? AND user_id = ?
//     `).get(guildId, userId);

//     if (!pet) {
//       return { success: false, reason: "no_pet" };
//     }

//     const foodCount = getPetFood(guildId, userId);
//     if (foodCount <= 0) {
//       return { success: false, reason: "no_food" };
//     }

//     const now = Date.now();
//     const nextFeedAt = pet.last_fed_at + cooldown;
//     if (pet.last_fed_at !== 0 && now < nextFeedAt) {
//       return { success: false, reason: "cooldown", nextFeedAt };
//     }

//     // Consume 1 food
//     db.prepare(`
//       UPDATE pet_food SET food_count = food_count - 1 WHERE guild_id = ? AND user_id = ?
//     `).run(guildId, userId);

//     // Update XP and check evolution stages (Stage 1 -> 2 at 100 XP, Stage 2 -> 3 at 250 XP)
//     let newXp = pet.xp + 25;
//     let newStage = pet.stage;
//     let evolved = false;

//     if (newStage === 1 && newXp >= 100) {
//       newStage = 2;
//       evolved = true;
//     } else if (newStage === 2 && newXp >= 250) {
//       newStage = 3;
//       evolved = true;
//     }

//     db.prepare(`
//       UPDATE pets SET xp = ?, stage = ?, last_fed_at = ? WHERE guild_id = ? AND user_id = ?
//     `).run(newXp, newStage, now, guildId, userId);

//     return {
//       success: true,
//       petType: pet.pet_type,
//       stage: newStage,
//       xp: newXp,
//       evolved,
//       remainingFood: foodCount - 1
//     };
//   }).immediate();
// } 

import db from "./connection.js";

const FEED_COOLDOWN = 60 * 60 * 1000;
const MAX_INTEGER = Number.MAX_SAFE_INTEGER;

function wholeNumber(value, name) {
  const number = Number(value);

  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`Invalid ${name}.`);
  }

  return number;
}

function decodePet(pet) {
  if (!pet) return undefined;

  return {
    ...pet,
    stage: wholeNumber(pet.stage, "pet stage"),
    xp: wholeNumber(pet.xp, "pet XP"),
    last_fed_at: wholeNumber(pet.last_fed_at, "feeding timestamp"),
  };
}

async function transaction(callback) {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const result = await callback(client);

    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Pet transaction rollback failed:", rollbackError);
    }

    throw error;
  } finally {
    client.release();
  }
}

export async function initializePets() {
  // Create tables through the Supabase SQL Editor first.
  await db.query(
    `SELECT guild_id, user_id, pet_type, stage, xp, last_fed_at
     FROM public.pets
     LIMIT 0`
  );

  await db.query(
    `SELECT guild_id, user_id, food_count
     FROM public.pet_food
     LIMIT 0`
  );
}

export async function claimUserPet(guildId, userId, petType) {
  if (typeof petType !== "string" || !petType.trim()) {
    throw new Error("Invalid pet type.");
  }

  // The primary key prevents two simultaneous claims.
  const { rows } = await db.query(
    `INSERT INTO public.pets
       (guild_id, user_id, pet_type, stage, xp, last_fed_at)
     VALUES ($1, $2, $3, 1, 0, 0)
     ON CONFLICT (guild_id, user_id) DO NOTHING
     RETURNING pet_type`,
    [guildId, userId, petType]
  );

  if (rows[0]) {
    return {
      success: true,
      petType: rows[0].pet_type,
    };
  }

  const existing = await getPet(guildId, userId);

  if (!existing) {
    throw new Error("Your pet changed during the claim. Try again.");
  }

  return {
    success: false,
    reason: "already_claimed",
    petType: existing.pet_type,
  };
}

export async function getPet(guildId, userId) {
  const { rows } = await db.query(
    `SELECT *
     FROM public.pets
     WHERE guild_id = $1 AND user_id = $2`,
    [guildId, userId]
  );

  return decodePet(rows[0]);
}

export async function getPetFood(guildId, userId) {
  const { rows } = await db.query(
    `SELECT food_count
     FROM public.pet_food
     WHERE guild_id = $1 AND user_id = $2`,
    [guildId, userId]
  );

  return rows[0]
    ? wholeNumber(rows[0].food_count, "food count")
    : 0;
}

export async function buyPetFood(guildId, userId, cost = 50) {
  if (!Number.isSafeInteger(cost) || cost <= 0) {
    throw new Error("Food cost must be a positive whole number.");
  }

  return transaction(async (client) => {
    // Deduction and food award succeed together.
    const { rows: accounts } = await client.query(
      `UPDATE public.accounts
       SET balance = balance - $1
       WHERE guild_id = $2
         AND user_id = $3
         AND balance >= $1
       RETURNING balance`,
      [cost, guildId, userId]
    );

    if (!accounts[0]) {
      return {
        success: false,
        reason: "insufficient_funds",
        cost,
      };
    }

    const { rows: food } = await client.query(
      `INSERT INTO public.pet_food AS inventory
         (guild_id, user_id, food_count)
       VALUES ($1, $2, 1)
       ON CONFLICT (guild_id, user_id)
       DO UPDATE SET food_count = inventory.food_count + 1
       WHERE inventory.food_count < $3
       RETURNING food_count`,
      [guildId, userId, MAX_INTEGER]
    );

    if (!food[0]) {
      // Throwing rolls back the balance deduction.
      throw new Error("Your pet food inventory is full.");
    }

    return {
      success: true,
      cost,
      newBalance: wholeNumber(accounts[0].balance, "balance"),
      foodCount: wholeNumber(food[0].food_count, "food count"),
    };
  });
}

export async function feedUserPet(guildId, userId) {
  return transaction(async (client) => {
    // Serialize feeding attempts for this pet.
    const { rows: pets } = await client.query(
      `SELECT *
       FROM public.pets
       WHERE guild_id = $1 AND user_id = $2
       FOR UPDATE`,
      [guildId, userId]
    );

    const pet = decodePet(pets[0]);

    if (!pet) {
      return { success: false, reason: "no_pet" };
    }

    const { rows: foods } = await client.query(
      `SELECT food_count
       FROM public.pet_food
       WHERE guild_id = $1 AND user_id = $2
       FOR UPDATE`,
      [guildId, userId]
    );

    const foodCount = foods[0]
      ? wholeNumber(foods[0].food_count, "food count")
      : 0;

    if (foodCount <= 0) {
      return { success: false, reason: "no_food" };
    }

    const now = Date.now();
    const nextFeedAt = pet.last_fed_at + FEED_COOLDOWN;

    if (pet.last_fed_at !== 0 && now < nextFeedAt) {
      return {
        success: false,
        reason: "cooldown",
        nextFeedAt,
      };
    }

    const newXp = wholeNumber(pet.xp + 25, "pet XP");
    let newStage = pet.stage;
    let evolved = false;

    if (newStage === 1 && newXp >= 100) {
      newStage = 2;
      evolved = true;
    } else if (newStage === 2 && newXp >= 250) {
      newStage = 3;
      evolved = true;
    }

    await client.query(
      `UPDATE public.pet_food
       SET food_count = food_count - 1
       WHERE guild_id = $1 AND user_id = $2`,
      [guildId, userId]
    );

    await client.query(
      `UPDATE public.pets
       SET xp = $1,
           stage = $2,
           last_fed_at = $3
       WHERE guild_id = $4 AND user_id = $5`,
      [newXp, newStage, now, guildId, userId]
    );

    return {
      success: true,
      petType: pet.pet_type,
      stage: newStage,
      xp: newXp,
      evolved,
      remainingFood: foodCount - 1,
    };
  });
}