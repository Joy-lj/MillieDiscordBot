import db from "./connection.js";

export function getBalance(guildId, userId) {
  // Create the account if it doesn't exist.
  db.prepare(`
    INSERT INTO accounts (guild_id, user_id)
    VALUES (?, ?)
    ON CONFLICT (guild_id, user_id) DO NOTHING
  `).run(guildId, userId);

  // Read the account's balance.
  const account = db.prepare(`
    SELECT balance FROM accounts
    WHERE guild_id = ? AND user_id = ?
  `).get(guildId, userId);

  return account.balance;
}

export function claimDaily(guildId, userId) {
  const reward = 100;
  const cooldown = 24 * 60 * 60 * 1000;

  const claim = db.transaction(() => {
    const now = Date.now();

    // Create the account if needed.
    db.prepare( 
      `INSERT INTO accounts (guild_id, user_id)
      VALUES (?, ?)
      ON CONFLICT (guild_id, user_id) DO NOTHING`
    ).run(guildId, userId);

    const account = db.prepare(
      `SELECT balance, last_daily_at
      FROM accounts
      WHERE guild_id = ? AND user_id = ?`
    ).get(guildId, userId);

    const nextClaimAt = account.last_daily_at + cooldown;

    // Stop if the previous claim was less than 24 hours ago.
    if (account.last_daily_at !== 0 && now < nextClaimAt) {
      return {
        success: false,
        nextClaimAt,
      };
    }

    // Award coins and save the claim time together.
    db.prepare(
      `UPDATE accounts
      SET balance = balance + ?, last_daily_at = ?
      WHERE guild_id = ? AND user_id = ?`
    ).run(reward, now, guildId, userId);

    return {
      success: true,
      reward,
      balance: account.balance + reward,
    };
  });

  return claim.immediate();
}

export function getLeaderboard(guildId) {
  return db.prepare(`
    SELECT user_id, balance
    FROM accounts
    WHERE guild_id = ?
    ORDER BY balance DESC, user_id ASC
    LIMIT 10
  `).all(guildId);
}

export function giveCoins(guildId, userId, amount) {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("Amount must be a positive whole number.");
  }

  const give = db.transaction(() => {
    // Create the account if needed.
    db.prepare(`
      INSERT INTO accounts (guild_id, user_id)
      VALUES (?, ?)
      ON CONFLICT (guild_id, user_id) DO NOTHING
    `).run(guildId, userId);

    // Prevent balances from exceeding JavaScript's safe integer limit.
    const account = db.prepare(`
      UPDATE accounts
      SET balance = balance + ?
      WHERE guild_id = ? AND user_id = ?
        AND balance <= ?
      RETURNING balance
    `).get(amount, guildId, userId, Number.MAX_SAFE_INTEGER - amount);

    if (!account) {
      return { success: false };
    }

    return { success: true, balance: account.balance };
  });

  return give.immediate();
}

export function claimWork(guildId, userId) {
  const cooldown = 2 * 60 * 60 * 1000;

  const outcomes = [
    {
      weight: 50,
      min: 10,
      max: 40,
      message: "You scanned tickets at the festival entrance.",
    },
    {
      weight: 25,
      min: 40,
      max: 70,
      message: "You scooped Millie's litterbox and cleaned the cat tree.",
    },
    {
      weight: 15,
      min: 70,
      max: 120,
      message: "You caught a large Bluefin Tuna!",
    },
    {
      weight: 5,
      min: 150,
      max: 250,
      message: "You saved a cat from a tree and became a local hero!",
    },
    {
      weight: 5,
      min: 0,
      max: 0,
      message: "You failed to find any work today. Better luck next time!",
    }
  ];

  const work = db.transaction(() => {
    const now = Date.now();

    // Create an account for new users.
    db.prepare(
      `INSERT INTO accounts (guild_id, user_id)
      VALUES (?, ?)
      ON CONFLICT (guild_id, user_id) DO NOTHING`
    ).run(guildId, userId);

    const account = db.prepare(
      `SELECT balance, last_work_at
      FROM accounts
      WHERE guild_id = ? AND user_id = ?`
    ).get(guildId, userId);

    const nextWorkAt = account.last_work_at + cooldown;

    if (account.last_work_at !== 0 && now < nextWorkAt) {
      return { success: false, reason: "cooldown", nextWorkAt };
    }

    // Choose an outcome using its weight.
    const totalWeight = outcomes.reduce(
      (total, outcome) => total + outcome.weight,
      0
    );

    let roll = Math.random() * totalWeight;
    let selected = outcomes[outcomes.length - 1];

    for (const outcome of outcomes) {
      if (roll < outcome.weight) {
        selected = outcome;
        break;
      }

      roll -= outcome.weight;
    }
// Choose a whole-number reward, including both endpoints.
    const reward =
      Math.floor(Math.random() * (selected.max - selected.min + 1)) +
      selected.min;

    // Save the reward and cooldown together.
    const updated = db.prepare(
      `UPDATE accounts
      SET balance = balance + ?, last_work_at = ?
      WHERE guild_id = ? AND user_id = ?
        AND balance <= ?
      RETURNING balance`
    ).get(
      reward,
      now,
      guildId,
      userId,
      Number.MAX_SAFE_INTEGER - reward
    );

    if (!updated) {
      return { success: false, reason: "balance_limit" };
    }

    return {
      success: true,
      reward,
      balance: updated.balance,
      message: selected.message,
    };
  });

  return work.immediate();
}

export function removeCoins(guildId, userId, amount) {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("Amount must be a positive whole number.");
  }

  // Only subtract if the account has enough currency.
  const account = db.prepare(
    `UPDATE accounts
    SET balance = balance - ?
    WHERE guild_id = ? AND user_id = ?
      AND balance >= ?
    RETURNING balance`
  ).get(amount, guildId, userId, amount);

  if (!account) {
    return { success: false };
  }

  return { success: true, balance: account.balance };
}

export function donateCoins(guildId, senderId, recipientId, amount) {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return { success: false, reason: "invalid_amount" };
  }

  if (senderId === recipientId) {
    return { success: false, reason: "self_donation" };
  }

  // Both balance changes succeed together or neither happens.
  return db.transaction(() => {
    const sender = db.prepare(`
      SELECT balance FROM accounts
      WHERE guild_id = ? AND user_id = ?
    `).get(guildId, senderId);

    if (!sender || sender.balance < amount) {
      return { success: false, reason: "insufficient_funds" };
    }

    const recipient = db.prepare(`
      SELECT balance FROM accounts
      WHERE guild_id = ? AND user_id = ?
    `).get(guildId, recipientId);

    const recipientBalance = recipient?.balance ?? 0;

    if (recipientBalance > Number.MAX_SAFE_INTEGER - amount) {
      return { success: false, reason: "balance_limit" };
    }

    // Create the recipient's account if needed.
    db.prepare(`
      INSERT INTO accounts (guild_id, user_id)
      VALUES (?, ?)
      ON CONFLICT (guild_id, user_id) DO NOTHING
    `).run(guildId, recipientId);

    db.prepare(`
      UPDATE accounts SET balance = balance - ?
      WHERE guild_id = ? AND user_id = ?
    `).run(amount, guildId, senderId);

    db.prepare(`
      UPDATE accounts SET balance = balance + ?
      WHERE guild_id = ? AND user_id = ?
    `).run(amount, guildId, recipientId);

    return {
      success: true,
      senderBalance: sender.balance - amount,
    };
  }).immediate();
}

export function addXp(guildId, userId, amount = 15) {
  return db.transaction(() => {
    db.prepare(`
      INSERT INTO accounts (guild_id, user_id)
      VALUES (?, ?)
      ON CONFLICT (guild_id, user_id) DO NOTHING
    `).run(guildId, userId);

    const account = db.prepare(`
      SELECT level, xp, balance FROM accounts
      WHERE guild_id = ? AND user_id = ?
    `).get(guildId, userId);

    let { level, xp, balance } = account;
    xp += amount;

    let xpNeeded = level * 150; 
    let leveledUp = false;
    let rewardGiven = 0;
    let hitMilestone = false;

    while (xp >= xpNeeded) {
      xp -= xpNeeded;
      level += 1;
      leveledUp = true;

      // Reward currency & track milestones every 5 levels
      if (level % 5 === 0) {
        const milestoneReward = (level / 5) * 250; 
        balance += milestoneReward;
        rewardGiven += milestoneReward;
        hitMilestone = true;
      }

      xpNeeded = level * 150; 
    }

    db.prepare(`
      UPDATE accounts
      SET level = ?, xp = ?, balance = ?
      WHERE guild_id = ? AND user_id = ?
    `).run(level, xp, balance, guildId, userId);

    return {
      leveledUp,
      newLevel: level,
      rewardGiven,
      hitMilestone,
    };
  }).immediate();
}