// // Uses your existing accounts + bets tables. No new tables or schema migration.
// export function createFlowerPokerStore(db) {
//   function reserveMatch(guildId, firstId, secondId, wager, matchId) {
//     if (!Number.isSafeInteger(wager) || wager <= 0 || wager > 1_000_000) {
//       throw new Error("Invalid wager.");
//     }
//     if (firstId === secondId) throw new Error("Choose another player.");
//     return db.transaction(() => {
//       const players = [firstId, secondId];
//       const betIds = [`fp:${matchId}:a`, `fp:${matchId}:b`];
//       if (db.prepare("SELECT id FROM bets WHERE id IN (?, ?)").get(...betIds)) {
//         throw new Error("This challenge was already processed.");
//       }
//       for (const userId of players) {
//         const active = db.prepare(`
//           SELECT id FROM bets WHERE guild_id = ? AND user_id = ? AND status = 'open'
//         `).get(guildId, userId);
//         if (active) throw new Error("A player already has an active bet. Finish it first.");
//         const account = db.prepare(`
//           SELECT balance FROM accounts WHERE guild_id = ? AND user_id = ?
//         `).get(guildId, userId);
//         if (!account || account.balance < wager) {
//           throw new Error("Both players must still have enough currency when accepting.");
//         }
//         if (!Number.isSafeInteger(account.balance) || account.balance > Number.MAX_SAFE_INTEGER - wager) {
//           throw new Error("A player's balance is too high to accept this wager.");
//         }
//       }
//       players.forEach((userId, i) => {
//         db.prepare(`UPDATE accounts SET balance = balance - ? WHERE guild_id = ? AND user_id = ?`)
//           .run(wager, guildId, userId);
//         db.prepare(`INSERT INTO bets (id, guild_id, user_id, wager) VALUES (?, ?, ?, ?)`)
//           .run(betIds[i], guildId, userId, wager);
//       });
//       return { guildId, players, betIds, wager };
//     }).immediate();
//   }

//   // winner: 0 = first player, 1 = second player, null = tie/refund.
//   function settleMatch(match, winner = null) {
//     if (![null, 0, 1].includes(winner)) throw new Error("Invalid winner.");
//     return db.transaction(() => {
//       const rows = match.betIds.map((id) => db.prepare("SELECT * FROM bets WHERE id = ?").get(id));
//       if (rows.every((row) => row?.status === "settled")) return null;
//       if (rows.some((row, i) => !row || row.status !== "open" || row.guild_id !== match.guildId ||
//         row.user_id !== match.players[i] || row.wager !== match.wager)) {
//         throw new Error("Wager records are missing or inconsistent. No payout was made.");
//       }
//       const payouts = winner === null ? [match.wager, match.wager] :
//         [winner === 0 ? match.wager * 2 : 0, winner === 1 ? match.wager * 2 : 0];
//       const balances = rows.map((row, i) => {
//         const updated = db.prepare(`
//           UPDATE accounts SET balance = balance + ?
//           WHERE guild_id = ? AND user_id = ? AND balance <= ?
//           RETURNING balance
//         `).get(payouts[i], row.guild_id, row.user_id, Number.MAX_SAFE_INTEGER - payouts[i]);
//         if (!updated) throw new Error("Cannot settle: account missing or balance limit reached.");
//         db.prepare("UPDATE bets SET status = 'settled' WHERE id = ?").run(row.id);
//         return updated.balance;
//       });
//       return { payouts, balances };
//     }).immediate();
//   }
//   return { reserveMatch, settleMatch };
// }

// Uses the existing PostgreSQL accounts + bets tables.
// db must be the pg.Pool exported by connection.js.

const MAX_BALANCE = Number.MAX_SAFE_INTEGER;
const MAX_WAGER = 1_000_000;

function safeInteger(value, name) {
  const number = Number(value);

  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`Invalid ${name}.`);
  }

  return number;
}

function validateWager(wager) {
  if (
    !Number.isSafeInteger(wager) ||
    wager <= 0 ||
    wager > MAX_WAGER
  ) {
    throw new Error("Invalid wager.");
  }
}

function validateId(value, name) {
  if (typeof value !== "string" || !value) {
    throw new Error(`Invalid ${name}.`);
  }
}

export function createFlowerPokerStore(db) {
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
        console.error("Flower poker rollback failed:", rollbackError);
      }

      throw error;
    } finally {
      client.release();
    }
  }

  // Always lock accounts in the same order, including when players
  // challenge each other in opposite directions.
  async function lockAccounts(client, guildId, players) {
    const accounts = new Map();

    for (const userId of [...players].sort()) {
      const { rows } = await client.query(
        `SELECT balance
         FROM public.accounts
         WHERE guild_id = $1 AND user_id = $2
         FOR UPDATE`,
        [guildId, userId]
      );

      accounts.set(userId, rows[0] ?? null);
    }

    return accounts;
  }

  async function reserveMatch(
    guildId,
    firstId,
    secondId,
    wager,
    matchId
  ) {
    validateWager(wager);
    validateId(guildId, "guild ID");
    validateId(firstId, "first player");
    validateId(secondId, "second player");
    validateId(matchId, "match ID");

    if (firstId === secondId) {
      throw new Error("Choose another player.");
    }

    try {
      return await transaction(async (client) => {
        const players = [firstId, secondId];
        const betIds = [`fp:${matchId}:a`, `fp:${matchId}:b`];

        const accounts = await lockAccounts(
          client,
          guildId,
          players
        );

        const { rows: existing } = await client.query(
          `SELECT id
           FROM public.bets
           WHERE id IN ($1, $2)`,
          betIds
        );

        if (existing.length > 0) {
          throw new Error("This challenge was already processed.");
        }

        for (const userId of players) {
          const { rows: active } = await client.query(
            `SELECT id
             FROM public.bets
             WHERE guild_id = $1
               AND user_id = $2
               AND status = 'open'`,
            [guildId, userId]
          );

          if (active.length > 0) {
            throw new Error(
              "A player already has an active bet. Finish it first."
            );
          }

          const account = accounts.get(userId);

          if (!account) {
            throw new Error(
              "Both players must still have enough currency when accepting."
            );
          }

          const balance = safeInteger(account.balance, "balance");

          if (balance < wager) {
            throw new Error(
              "Both players must still have enough currency when accepting."
            );
          }

          // After deducting the wager, a win pays back twice the wager.
          if (balance > MAX_BALANCE - wager) {
            throw new Error(
              "A player's balance is too high to accept this wager."
            );
          }
        }

        for (let i = 0; i < players.length; i += 1) {
          await client.query(
            `UPDATE public.accounts
             SET balance = balance - $1
             WHERE guild_id = $2 AND user_id = $3`,
            [wager, guildId, players[i]]
          );

          await client.query(
            `INSERT INTO public.bets
             (id, guild_id, user_id, wager)
             VALUES ($1, $2, $3, $4)`,
            [betIds[i], guildId, players[i], wager]
          );
        }

        return { guildId, players, betIds, wager };
      });
    } catch (error) {
      // PostgreSQL unique violation. The transaction has already
      // rolled back both deductions.
      if (error.code === "23505") {
        if (error.constraint === "bets_one_open_per_player") {
          throw new Error(
            "A player already has an active bet. Finish it first."
          );
        }

        if (error.constraint === "bets_pkey") {
          throw new Error("This challenge was already processed.");
        }
      }

      throw error;
    }
  }

  // winner: 0 = first player, 1 = second player, null = tie/refund.
  async function settleMatch(match, winner = null) {
    if (![null, 0, 1].includes(winner)) {
      throw new Error("Invalid winner.");
    }

    if (
      !match ||
      !Array.isArray(match.players) ||
      match.players.length !== 2 ||
      !Array.isArray(match.betIds) ||
      match.betIds.length !== 2
    ) {
      throw new Error("Invalid match.");
    }

    validateId(match.guildId, "guild ID");
    validateWager(match.wager);

    for (const player of match.players) {
      validateId(player, "player ID");
    }

    for (const betId of match.betIds) {
      validateId(betId, "bet ID");
    }

    if (
      match.players[0] === match.players[1] ||
      match.betIds[0] === match.betIds[1]
    ) {
      throw new Error("Invalid match.");
    }

    return transaction(async (client) => {
      const accounts = await lockAccounts(
        client,
        match.guildId,
        match.players
      );

      // Lock bet records after accounts, matching the reservation
      // and standard betting settlement lock order.
      const { rows: lockedBets } = await client.query(
        `SELECT id, guild_id, user_id, wager, status
         FROM public.bets
         WHERE id IN ($1, $2)
         ORDER BY id
         FOR UPDATE`,
        match.betIds
      );

      const byId = new Map(
        lockedBets.map((bet) => [bet.id, bet])
      );

      // Restore first-player / second-player ordering.
      const bets = match.betIds.map((id) => byId.get(id));

      const inconsistent = bets.some(
        (bet, i) =>
          !bet ||
          bet.guild_id !== match.guildId ||
          bet.user_id !== match.players[i] ||
          safeInteger(bet.wager, "wager") !== match.wager
      );

      if (inconsistent) {
        throw new Error(
          "Wager records are missing or inconsistent. No payout was made."
        );
      }

      // Repeated settlement cannot award currency twice.
      if (bets.every((bet) => bet.status === "settled")) {
        return null;
      }

      if (bets.some((bet) => bet.status !== "open")) {
        throw new Error(
          "Wager records are missing or inconsistent. No payout was made."
        );
      }

      const payouts =
        winner === null
          ? [match.wager, match.wager]
          : [
            winner === 0 ? match.wager * 2 : 0,
            winner === 1 ? match.wager * 2 : 0,
          ];

      const balances = [];

      for (let i = 0; i < bets.length; i += 1) {
        const bet = bets[i];

        if (!accounts.get(bet.user_id)) {
          throw new Error(
            "Cannot settle: account missing or balance limit reached."
          );
        }

        const { rows: updated } = await client.query(
          `UPDATE public.accounts
           SET balance = balance + $1
           WHERE guild_id = $2
             AND user_id = $3
             AND balance <= $4
           RETURNING balance`,
          [
            payouts[i],
            bet.guild_id,
            bet.user_id,
            MAX_BALANCE - payouts[i],
          ]
        );

        if (!updated[0]) {
          throw new Error(
            "Cannot settle: account missing or balance limit reached."
          );
        }

        await client.query(
          `UPDATE public.bets
           SET status = 'settled'
           WHERE id = $1`,
          [bet.id]
        );

        balances.push(
          safeInteger(updated[0].balance, "balance")
        );
      }

      return { payouts, balances };
    });
  }

  return { reserveMatch, settleMatch };
}