// import db from "./connection.js";
// import { economyConfig } from "../config/economy.js";
// import { workConfig } from "../config/work.js";

// export function getBalance(guildId, userId) {
//   // Create the account if it doesn't exist.
//   db.prepare(`
//     INSERT INTO accounts (guild_id, user_id)
//     VALUES (?, ?)
//     ON CONFLICT (guild_id, user_id) DO NOTHING
//   `).run(guildId, userId);

//   // Read the account's balance.
//   const account = db.prepare(`
//     SELECT balance FROM accounts
//     WHERE guild_id = ? AND user_id = ?
//   `).get(guildId, userId);

//   return account.balance;
// }

// export function claimDaily(guildId, userId) {
//   const baseReward = economyConfig.dailyReward;
//   const cooldown = economyConfig.dailyCooldown;

//   const claim = db.transaction(() => {
//     const now = Date.now();

//     // Create the account if needed.
//     db.prepare( 
//       `INSERT INTO accounts (guild_id, user_id)
//       VALUES (?, ?)
//       ON CONFLICT (guild_id, user_id) DO NOTHING`
//     ).run(guildId, userId);

//     const account = db.prepare(
//       `SELECT balance, last_daily_at
//       FROM accounts
//       WHERE guild_id = ? AND user_id = ?`
//     ).get(guildId, userId);

//     const nextClaimAt = account.last_daily_at + cooldown;

//     // Stop if the previous claim was less than 24 hours ago.
//     if (account.last_daily_at !== 0 && now < nextClaimAt) {
//       return {
//         success: false,
//         nextClaimAt,
//       };
//     }

//     const pet = db.prepare(`
//       SELECT pet_type, stage FROM pets WHERE guild_id = ? AND user_id = ?
//     `).get(guildId, userId);

//     let reward = baseReward;
//     let dogMultiplierMessage = "";

//     if (pet && pet.pet_type === "dog") {
//       if (pet.stage === 2) {
//         reward = Math.floor(baseReward * 1.5);
//         dogMultiplierMessage = " (🐶 Dog Stage 2 Bonus: +50%)";
//       } else if (pet.stage === 3) {
//         reward = baseReward * 2;
//         dogMultiplierMessage = " (🐶 Loyal Hound Max Bonus: +100%)";
//       }
//     }

//     // Award coins and save the claim time together.
//     db.prepare(
//       `UPDATE accounts
//       SET balance = balance + ?, last_daily_at = ?
//       WHERE guild_id = ? AND user_id = ?`
//     ).run(reward, now, guildId, userId);

//     return {
//       success: true,
//       reward,
//       balance: account.balance + reward,
//       dogMultiplierMessage,
//     };
//   });

//   return claim.immediate();
// }

// export function getLeaderboard(guildId) {
//   return db.prepare(`
//     SELECT user_id, balance
//     FROM accounts
//     WHERE guild_id = ?
//     ORDER BY balance DESC, user_id ASC
//     LIMIT 10
//   `).all(guildId);
// }

// export function giveCoins(guildId, userId, amount) {
//   if (!Number.isSafeInteger(amount) || amount <= 0) {
//     throw new Error("Amount must be a positive whole number.");
//   }

//   const give = db.transaction(() => {
//     // Create the account if needed.
//     db.prepare(`
//       INSERT INTO accounts (guild_id, user_id)
//       VALUES (?, ?)
//       ON CONFLICT (guild_id, user_id) DO NOTHING
//     `).run(guildId, userId);

//     // Prevent balances from exceeding JavaScript's safe integer limit.
//     const account = db.prepare(`
//       UPDATE accounts
//       SET balance = balance + ?
//       WHERE guild_id = ? AND user_id = ?
//         AND balance <= ?
//       RETURNING balance
//     `).get(amount, guildId, userId, Number.MAX_SAFE_INTEGER - amount);

//     if (!account) {
//       return { success: false };
//     }

//     return { success: true, balance: account.balance };
//   });

//   return give.immediate();
// }

// export function claimWork(guildId, userId) {
//   const outcomes = workConfig.outcomes;
//   const cooldown = workConfig.workCooldown;

//   const work = db.transaction(() => {
//     const now = Date.now();

//     // Create an account for new users.
//     db.prepare(
//       `INSERT INTO accounts (guild_id, user_id)
//       VALUES (?, ?)
//       ON CONFLICT (guild_id, user_id) DO NOTHING`
//     ).run(guildId, userId);

//     const account = db.prepare(
//       `SELECT balance, last_work_at
//       FROM accounts
//       WHERE guild_id = ? AND user_id = ?`
//     ).get(guildId, userId);

//     const nextWorkAt = account.last_work_at + cooldown;

//     if (account.last_work_at !== 0 && now < nextWorkAt) {
//       return { success: false, reason: "cooldown", nextWorkAt };
//     }

//     let outcomes = JSON.parse(JSON.stringify(workConfig.outcomes));

//     // Check cat pet evolution stage for work luck bonuses
//     const pet = db.prepare(`
//       SELECT pet_type, stage FROM pets WHERE guild_id = ? AND user_id = ?
//     `).get(guildId, userId);

//     let catLuckMessage = "";
//     if (pet && pet.pet_type === "cat") {
//       if (pet.stage === 2) {
//         outcomes[0].weight = 40;
//         outcomes[4].weight = 2;
//         catLuckMessage = " 🐱 *(Stage 2 Cat sharpens your instincts!)*";
//       } else if (pet.stage === 3) {
//         outcomes[0].weight = 25;
//         outcomes[1].weight = 35;
//         outcomes[4].weight = 0;
//         catLuckMessage = " 🐱 *(Max Stage Cat grants absolute work mastery - no fails!)*";
//       }
//     }

//     // Choose an outcome using its weight.
//     const totalWeight = outcomes.reduce(
//       (total, outcome) => total + outcome.weight,
//       0
//     );

//     let roll = Math.random() * totalWeight;
//     let selected = outcomes[outcomes.length - 1];

//     for (const outcome of outcomes) {
//       if (roll < outcome.weight) {
//         selected = outcome;
//         break;
//       }

//       roll -= outcome.weight;
//     }
// // Choose a whole-number reward, including both endpoints.
//     const reward =
//       Math.floor(Math.random() * (selected.max - selected.min + 1)) +
//       selected.min;

//     // Save the reward and cooldown together.
//     const updated = db.prepare(
//       `UPDATE accounts
//       SET balance = balance + ?, last_work_at = ?
//       WHERE guild_id = ? AND user_id = ?
//         AND balance <= ?
//       RETURNING balance`
//     ).get(
//       reward,
//       now,
//       guildId,
//       userId,
//       Number.MAX_SAFE_INTEGER - reward
//     );

//     if (!updated) {
//       return { success: false, reason: "balance_limit" };
//     }

//     return {
//       success: true,
//       reward,
//       balance: updated.balance,
//       message: selected.message,
//     };
//   });

//   return work.immediate();
// }

// export function removeCoins(guildId, userId, amount) {
//   if (!Number.isSafeInteger(amount) || amount <= 0) {
//     throw new Error("Amount must be a positive whole number.");
//   }

//   // Only subtract if the account has enough currency.
//   const account = db.prepare(
//     `UPDATE accounts
//     SET balance = balance - ?
//     WHERE guild_id = ? AND user_id = ?
//       AND balance >= ?
//     RETURNING balance`
//   ).get(amount, guildId, userId, amount);

//   if (!account) {
//     return { success: false };
//   }

//   return { success: true, balance: account.balance };
// }

// export function donateCoins(guildId, senderId, recipientId, amount) {
//   if (!Number.isSafeInteger(amount) || amount <= 0) {
//     return { success: false, reason: "invalid_amount" };
//   }

//   if (senderId === recipientId) {
//     return { success: false, reason: "self_donation" };
//   }

//   // Both balance changes succeed together or neither happens.
//   return db.transaction(() => {
//     const sender = db.prepare(`
//       SELECT balance FROM accounts
//       WHERE guild_id = ? AND user_id = ?
//     `).get(guildId, senderId);

//     if (!sender || sender.balance < amount) {
//       return { success: false, reason: "insufficient_funds" };
//     }

//     const recipient = db.prepare(`
//       SELECT balance FROM accounts
//       WHERE guild_id = ? AND user_id = ?
//     `).get(guildId, recipientId);

//     const recipientBalance = recipient?.balance ?? 0;

//     if (recipientBalance > Number.MAX_SAFE_INTEGER - amount) {
//       return { success: false, reason: "balance_limit" };
//     }

//     // Create the recipient's account if needed.
//     db.prepare(`
//       INSERT INTO accounts (guild_id, user_id)
//       VALUES (?, ?)
//       ON CONFLICT (guild_id, user_id) DO NOTHING
//     `).run(guildId, recipientId);

//     db.prepare(`
//       UPDATE accounts SET balance = balance - ?
//       WHERE guild_id = ? AND user_id = ?
//     `).run(amount, guildId, senderId);

//     db.prepare(`
//       UPDATE accounts SET balance = balance + ?
//       WHERE guild_id = ? AND user_id = ?
//     `).run(amount, guildId, recipientId);

//     return {
//       success: true,
//       senderBalance: sender.balance - amount,
//     };
//   }).immediate();
// }

// export function addXp(guildId, userId, amount = 15) {
//   return db.transaction(() => {
//     db.prepare(`
//       INSERT INTO accounts (guild_id, user_id)
//       VALUES (?, ?)
//       ON CONFLICT (guild_id, user_id) DO NOTHING
//     `).run(guildId, userId);

//     const account = db.prepare(`
//       SELECT level, xp, balance FROM accounts
//       WHERE guild_id = ? AND user_id = ?
//     `).get(guildId, userId);

//     let { level, xp, balance } = account;
//     xp += amount;

//     let xpNeeded = level * 150; 
//     let leveledUp = false;
//     let rewardGiven = 0;
//     let hitMilestone = false;

//     while (xp >= xpNeeded) {
//       xp -= xpNeeded;
//       level += 1;
//       leveledUp = true;

//       // Reward currency & track milestones every 5 levels
//       if (level % 5 === 0) {
//         const milestoneReward = (level / 5) * 250; 
//         balance += milestoneReward;
//         rewardGiven += milestoneReward;
//         hitMilestone = true;
//       }

//       xpNeeded = level * 150; 
//     }

//     db.prepare(`
//       UPDATE accounts
//       SET level = ?, xp = ?, balance = ?
//       WHERE guild_id = ? AND user_id = ?
//     `).run(level, xp, balance, guildId, userId);

//     return {
//       leveledUp,
//       newLevel: level,
//       rewardGiven,
//       hitMilestone,
//     };
//   }).immediate();
// }

import db from "./connection.js";
import { economyConfig } from "../config/economy.js";
import { workConfig } from "../config/work.js";

const MAX_BALANCE = Number.MAX_SAFE_INTEGER;

// PostgreSQL BIGINT values can arrive as strings.
// Convert only values that JavaScript can represent exactly.
function wholeNumber(value, name = "Value") {
  const number = Number(value);

  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`${name} must be a non-negative safe whole number.`);
  }

  return number;
}

function validateAmount(amount) {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("Amount must be a positive whole number.");
  }
}

// Every query inside a transaction uses this same client.
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
      console.error("Database rollback failed:", rollbackError);
    }

    throw error;
  } finally {
    client.release();
  }
}

async function ensureAccount(client, guildId, userId) {
  await client.query(
    `INSERT INTO accounts (guild_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (guild_id, user_id) DO NOTHING`,
    [guildId, userId]
  );
}

// Call only inside a transaction.
// Other commands modifying this account wait until it finishes.
async function lockAccount(client, guildId, userId) {
  await ensureAccount(client, guildId, userId);

  const { rows } = await client.query(
    `SELECT balance, last_daily_at, last_work_at, level, xp
     FROM accounts
     WHERE guild_id = $1 AND user_id = $2
     FOR UPDATE`,
    [guildId, userId]
  );

  const account = rows[0];

  if (!account) {
    throw new Error("Account could not be loaded.");
  }

  return {
    balance: wholeNumber(account.balance, "Balance"),
    last_daily_at: wholeNumber(account.last_daily_at, "Daily timestamp"),
    last_work_at: wholeNumber(account.last_work_at, "Work timestamp"),
    level: wholeNumber(account.level, "Level"),
    xp: wholeNumber(account.xp, "XP"),
  };
}

async function getPet(client, guildId, userId) {
  const { rows } = await client.query(
    `SELECT pet_type, stage
     FROM pets
     WHERE guild_id = $1 AND user_id = $2`,
    [guildId, userId]
  );

  const pet = rows[0];

  return pet
    ? { ...pet, stage: Number(pet.stage) }
    : null;
}

export async function getBalance(guildId, userId) {
  return transaction(async (client) => {
    const account = await lockAccount(client, guildId, userId);
    return account.balance;
  });
}

export async function claimDaily(guildId, userId) {
  const baseReward = wholeNumber(economyConfig.dailyReward, "Daily reward");
  const cooldown = wholeNumber(economyConfig.dailyCooldown, "Daily cooldown");

  return transaction(async (client) => {
    const account = await lockAccount(client, guildId, userId);
    const now = Date.now();
    const nextClaimAt = account.last_daily_at + cooldown;

    if (account.last_daily_at !== 0 && now < nextClaimAt) {
      return {
        success: false,
        nextClaimAt,
      };
    }

    const pet = await getPet(client, guildId, userId);

    let reward = baseReward;
    let dogMultiplierMessage = "";

    if (pet?.pet_type === "dog") {
      if (pet.stage === 2) {
        reward = Math.floor(baseReward * 1.5);
        dogMultiplierMessage = " (🐶 Dog Stage 2 Bonus: +50%)";
      } else if (pet.stage === 3) {
        reward = baseReward * 2;
        dogMultiplierMessage = " (🐶 Loyal Hound Max Bonus: +100%)";
      }
    }

    reward = wholeNumber(reward, "Daily reward");

    if (account.balance > MAX_BALANCE - reward) {
      return { success: false, reason: "balance_limit" };
    }

    const { rows } = await client.query(
      `UPDATE accounts
       SET balance = balance + $1,
           last_daily_at = $2
       WHERE guild_id = $3 AND user_id = $4
       RETURNING balance`,
      [reward, now, guildId, userId]
    );

    return {
      success: true,
      reward,
      balance: wholeNumber(rows[0].balance, "Balance"),
      dogMultiplierMessage,
    };
  });
}

export async function getLeaderboard(guildId) {
  const { rows } = await db.query(
    `SELECT user_id, balance
     FROM accounts
     WHERE guild_id = $1
     ORDER BY balance DESC, user_id ASC
     LIMIT 10`,
    [guildId]
  );

  return rows.map((account) => ({
    ...account,
    balance: wholeNumber(account.balance, "Balance"),
  }));
}

export async function giveCoins(guildId, userId, amount) {
  validateAmount(amount);

  return transaction(async (client) => {
    const account = await lockAccount(client, guildId, userId);

    if (account.balance > MAX_BALANCE - amount) {
      return { success: false };
    }

    const { rows } = await client.query(
      `UPDATE accounts
       SET balance = balance + $1
       WHERE guild_id = $2 AND user_id = $3
       RETURNING balance`,
      [amount, guildId, userId]
    );

    return {
      success: true,
      balance: wholeNumber(rows[0].balance, "Balance"),
    };
  });
}

export async function claimWork(guildId, userId) {
  const cooldown = wholeNumber(workConfig.workCooldown, "Work cooldown");

  return transaction(async (client) => {
    const account = await lockAccount(client, guildId, userId);
    const now = Date.now();
    const nextWorkAt = account.last_work_at + cooldown;

    if (account.last_work_at !== 0 && now < nextWorkAt) {
      return {
        success: false,
        reason: "cooldown",
        nextWorkAt,
      };
    }

    // Copy outcomes so pet bonuses don't modify the global config.
    const outcomes = workConfig.outcomes.map((outcome) => ({
      ...outcome,
    }));

    if (outcomes.length === 0) {
      throw new Error("Work config must contain at least one outcome.");
    }

    const pet = await getPet(client, guildId, userId);
    let catLuckMessage = "";

    if (pet?.pet_type === "cat" && pet.stage >= 2) {
      // These bonuses use your current five-outcome config.
      if (outcomes.length < 5) {
        throw new Error("Cat work bonuses require at least five outcomes.");
      }

      if (pet.stage === 2) {
        outcomes[0].weight = 40;
        outcomes[4].weight = 2;
        catLuckMessage =
          " 🐱 *(Stage 2 Cat sharpens your instincts!)*";
      } else if (pet.stage === 3) {
        outcomes[0].weight = 25;
        outcomes[1].weight = 35;
        outcomes[4].weight = 0;
        catLuckMessage =
          " 🐱 *(Max Stage Cat grants absolute work mastery - no fails!)*";
      }
    }

    for (const outcome of outcomes) {
      if (!Number.isFinite(outcome.weight) || outcome.weight < 0) {
        throw new Error("Work weights must be non-negative numbers.");
      }

      wholeNumber(outcome.min, "Minimum work reward");
      wholeNumber(outcome.max, "Maximum work reward");

      if (outcome.max < outcome.min) {
        throw new Error("Maximum work reward must be at least the minimum.");
      }
    }

    const totalWeight = outcomes.reduce(
      (total, outcome) => total + outcome.weight,
      0
    );

    if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
      throw new Error("Work outcomes must have a positive total weight.");
    }

    let roll = Math.random() * totalWeight;
    let selected = outcomes.findLast((outcome) => outcome.weight > 0);

    for (const outcome of outcomes) {
      if (roll < outcome.weight) {
        selected = outcome;
        break;
      }

      roll -= outcome.weight;
    }

    const reward =
      Math.floor(Math.random() * (selected.max - selected.min + 1)) +
      selected.min;

    if (account.balance > MAX_BALANCE - reward) {
      return { success: false, reason: "balance_limit" };
    }

    const { rows } = await client.query(
      `UPDATE accounts
       SET balance = balance + $1,
           last_work_at = $2
       WHERE guild_id = $3 AND user_id = $4
       RETURNING balance`,
      [reward, now, guildId, userId]
    );

    return {
      success: true,
      reward,
      balance: wholeNumber(rows[0].balance, "Balance"),
      message: selected.message,
      catLuckMessage,
    };
  });
}

export async function removeCoins(guildId, userId, amount) {
  validateAmount(amount);

  // This conditional update is atomic without a separate SELECT.
  const { rows } = await db.query(
    `UPDATE accounts
     SET balance = balance - $1
     WHERE guild_id = $2 AND user_id = $3
       AND balance >= $1
     RETURNING balance`,
    [amount, guildId, userId]
  );

  if (!rows[0]) {
    return { success: false };
  }

  return {
    success: true,
    balance: wholeNumber(rows[0].balance, "Balance"),
  };
}

export async function donateCoins(
  guildId,
  senderId,
  recipientId,
  amount
) {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return { success: false, reason: "invalid_amount" };
  }

  if (senderId === recipientId) {
    return { success: false, reason: "self_donation" };
  }

  return transaction(async (client) => {
    // Always create and lock accounts in the same order.
    // This prevents opposing donations from locking them in reverse order.
    const userIds = [senderId, recipientId].sort();
    const accounts = new Map();

    for (const userId of userIds) {
      accounts.set(
        userId,
        await lockAccount(client, guildId, userId)
      );
    }

    const sender = accounts.get(senderId);
    const recipient = accounts.get(recipientId);

    if (sender.balance < amount) {
      return { success: false, reason: "insufficient_funds" };
    }

    if (recipient.balance > MAX_BALANCE - amount) {
      return { success: false, reason: "balance_limit" };
    }

    await client.query(
      `UPDATE accounts
       SET balance = balance - $1
       WHERE guild_id = $2 AND user_id = $3`,
      [amount, guildId, senderId]
    );

    await client.query(
      `UPDATE accounts
       SET balance = balance + $1
       WHERE guild_id = $2 AND user_id = $3`,
      [amount, guildId, recipientId]
    );

    return {
      success: true,
      senderBalance: sender.balance - amount,
    };
  });
}

export async function addXp(guildId, userId, amount = 15) {
  wholeNumber(amount, "XP amount");

  return transaction(async (client) => {
    const account = await lockAccount(client, guildId, userId);

    let { level, xp, balance } = account;

    if (level < 1) {
      throw new Error("Account level must be at least 1.");
    }

    xp = wholeNumber(xp + amount, "Total XP");

    let xpNeeded = wholeNumber(level * 150, "Required XP");
    let leveledUp = false;
    let rewardGiven = 0;
    let hitMilestone = false;

    while (xp >= xpNeeded) {
      xp -= xpNeeded;
      level += 1;
      leveledUp = true;

      if (level % 5 === 0) {
        const milestoneReward = (level / 5) * 250;

        if (balance > MAX_BALANCE - milestoneReward) {
          // Throwing rolls back the entire XP update.
          throw new Error("Level-up reward would exceed the balance limit.");
        }

        balance += milestoneReward;
        rewardGiven += milestoneReward;
        hitMilestone = true;
      }

      xpNeeded = wholeNumber(level * 150, "Required XP");
    }

    await client.query(
      `UPDATE accounts
       SET level = $1,
           xp = $2,
           balance = $3
       WHERE guild_id = $4 AND user_id = $5`,
      [level, xp, balance, guildId, userId]
    );

    return {
      leveledUp,
      newLevel: level,
      rewardGiven,
      hitMilestone,
    };
  });
}