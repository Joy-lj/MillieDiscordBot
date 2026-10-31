import { createHash, randomInt, randomUUID } from "node:crypto";
import { DungeonError, dungeonForParty, makePlayer, resolveRound, startState, validateChoice, validateConfig } from "./dungeonLogic.js";
export { DungeonError } from "./dungeonLogic.js";
const fail = (message) => { throw new DungeonError(message); };
import { snapshotLootTable, rollDungeonLoot, decodeLoot, grantDungeonLoot } from "./dungeonLootLogic.js";
const MAX_BALANCE = Number.MAX_SAFE_INTEGER;

function decode(row) {
  if (!row) fail("Dungeon not found. It may have been removed by an economy reset.");
  // The migration fills party_ids for old co-op runs. Fallback also supports
  // pre-migration snapshots in fixtures without changing their saved rules.
  const party = row.party_ids ?? [row.leader_id, row.partner_id].filter((user) => user != null);
  if (!Array.isArray(party) || ![1, 2].includes(party.length) || new Set(party).size !== party.length ||
      party.some((user) => typeof user !== "string" || !user) || party[0] !== row.leader_id ||
      (party.length === 1 ? row.partner_id != null : party[1] !== row.partner_id)) fail("Invalid saved dungeon party.");
  return { ...row, party_ids: party, state: typeof row.state === "string" ? JSON.parse(row.state) : row.state,
    expires_at: Number(row.expires_at), created_at: Number(row.created_at) };
}

export function createDungeonStore(db, items, config, { rng = randomInt, lootRng = randomInt, clock = Date.now, lootTables = null } = {}) {
  validateConfig(config);
  // Fail at startup for malformed/missing tables, not after a successful fight.
  if (lootTables !== null) for (const difficulty of Object.keys(config.difficulties)) {
    snapshotLootTable(lootTables[difficulty], items);
  }

  async function transaction(guild, fn) {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      // Short transactions serialize dungeon mutations per guild. No combat
      // transaction remains open while waiting for Discord or a player's choice.
      const key = createHash("sha256").update(`dungeon:${guild}`).digest().readBigInt64BE(0).toString();
      await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [key]);
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); }
      catch (rollbackError) { console.error("Dungeon rollback failed:", rollbackError); }
      throw error;
    } finally { client.release(); }
  }

  async function lockAccounts(client, guild, users) {
    const accounts = new Map();
    for (const user of [...users].sort()) {
      const { rows } = await client.query(
        `SELECT a.user_id, a.balance, w.item_id AS weapon_item_id, r.item_id AS armor_item_id
         FROM public.accounts a
         LEFT JOIN public.user_items w ON w.id = a.equipped_weapon_id
           AND w.guild_id = a.guild_id AND w.user_id = a.user_id
         LEFT JOIN public.user_items r ON r.id = a.equipped_armor_id
           AND r.guild_id = a.guild_id AND r.user_id = a.user_id
         WHERE a.guild_id = $1 AND a.user_id = $2 FOR UPDATE OF a`, [guild, user]
      );
      if (!rows[0]) fail("Every participant needs an economy account. Run !balance first.");
      accounts.set(user, rows[0]);
    }
    return accounts;
  }

  async function load(client, guild, id, lock = false) {
    const { rows } = await client.query(
      `SELECT * FROM public.dungeon_runs WHERE guild_id = $1 AND id = $2${lock ? " FOR UPDATE" : ""}`, [guild, id]
    );
    return decode(rows[0]);
  }

  async function save(client, run) {
    await client.query(
      `UPDATE public.dungeon_runs SET status = $1, state = $2::jsonb, expires_at = $3 WHERE id = $4`,
      [run.status, JSON.stringify(run.state), run.expires_at, run.id]
    );
  }

  async function releaseParty(client, run) {
    await client.query("UPDATE public.dungeon_members SET run_id = NULL WHERE run_id = $1", [run.id]);
  }

  async function expire(client, run) {
    if (["invited", "active"].includes(run.status) && run.expires_at <= clock()) {
      run.status = "expired";
      run.state.status = "expired";
      run.state.log = ["The invitation or action deadline expired. No clear reward was earned."];
      run.expires_at = 0;
      await save(client, run);
      await releaseParty(client, run);
    }
  }

  async function present(client, run) {
    const { rows } = await client.query(
      "SELECT user_id, amount, claimed_at, loot, loot_rolled FROM public.dungeon_rewards WHERE run_id = $1 ORDER BY user_id", [run.id]
    );
    return { ...run, rewards: rows.map((row) => ({ ...row, loot: decodeLoot(row.loot), amount: Number(row.amount), claimed_at: row.claimed_at == null ? null : Number(row.claimed_at) })) };
  }

  async function mutate(guild, user, id, fn) {
    return transaction(guild, async (client) => {
      const candidate = await load(client, guild, id);
      if (!candidate.party_ids.includes(user)) fail("This dungeon belongs to another party.");
      const accounts = await lockAccounts(client, guild, candidate.party_ids);
      const run = await load(client, guild, id, true);
      await expire(client, run);
      const receipt = await fn(client, run, accounts);
      return { run: await present(client, run), receipt };
    });
  }

  async function create(guild, channel, leader, partner = null, difficulty = "easy") {
    if (typeof leader !== "string" || !leader || (partner != null && (typeof partner !== "string" || !partner))) fail("Invalid dungeon player.");
    if (leader === partner) fail("Choose another player.");
    if (!Object.hasOwn(config.difficulties, difficulty)) fail("Choose easy, normal, or hard.");
    const party = partner == null ? [leader] : [leader, partner];
    const mode = party.length === 1 ? "solo" : "coop";
    const lootTable = lootTables === null ? null : snapshotLootTable(lootTables[difficulty], items);
    const dungeon = dungeonForParty(config.difficulties[difficulty], party.length, config);
    return transaction(guild, async (client) => {
      const accounts = await lockAccounts(client, guild, party);
      for (const user of [...party].sort()) {
        await client.query(
          `INSERT INTO public.dungeon_members (guild_id, user_id) VALUES ($1, $2)
           ON CONFLICT (guild_id, user_id) DO NOTHING`, [guild, user]
        );
        const { rows } = await client.query(
          "SELECT run_id, next_entry_at FROM public.dungeon_members WHERE guild_id = $1 AND user_id = $2 FOR UPDATE", [guild, user]
        );
        const member = rows[0];
        if (member.run_id) {
          const previous = await load(client, guild, member.run_id, true);
          await expire(client, previous);
          if (["invited", "active"].includes(previous.status)) fail("A player already has a dungeon. Use !dungeon to resume or leave it.");
        }
        if (Number(member.next_entry_at) > clock()) {
          fail(`A player can enter again <t:${Math.ceil(Number(member.next_entry_at) / 1000)}:R>.`);
        }
      }
      const now = clock();
      const run = {
        id: randomUUID(), guild_id: guild, channel_id: channel, leader_id: leader, partner_id: partner ?? null, party_ids: party,
        status: mode === "solo" ? "active" : "invited", created_at: now,
        expires_at: now + (mode === "solo" ? config.roundMs : config.inviteMs),
        state: { version: 1, mode, status: "invited", round: 0, difficulty, dungeon: structuredClone(dungeon), rules: structuredClone(config), players: [], log: [] },
      };
      if (mode === "solo") {
        const account = accounts.get(leader);
        run.state = startState(dungeon, [makePlayer(leader, account.weapon_item_id, account.armor_item_id, items, config)], config);
        run.state.difficulty = difficulty;
      }
      run.state.lootTable = lootTable;
      await client.query(
        `INSERT INTO public.dungeon_runs
         (id, guild_id, channel_id, leader_id, partner_id, status, state, created_at, expires_at, party_ids)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10::text[])`,
        [run.id, guild, channel, leader, partner ?? null, run.status, JSON.stringify(run.state), now, run.expires_at, party]
      );
      for (const user of party) {
        await client.query("UPDATE public.dungeon_members SET run_id = $1 WHERE guild_id = $2 AND user_id = $3", [run.id, guild, user]);
        if (mode === "solo") {
          await client.query(
            "UPDATE public.dungeon_members SET next_entry_at = $1 WHERE guild_id = $2 AND user_id = $3",
            [now + config.cooldownMs, guild, user]
          );
        }
      }
      return present(client, run);
    });
  }

  async function act(guild, user, id, round, action) {
    return mutate(guild, user, id, async (client, run, accounts) => {
      if (action === "refresh") return null;
      if (action === "claim") {
        if (run.status !== "won") fail("This dungeon has no clear reward.");
        const { rows } = await client.query(
          "SELECT amount, claimed_at, balance_after, loot, item_receipts, loot_rolled FROM public.dungeon_rewards WHERE run_id = $1 AND user_id = $2 FOR UPDATE", [id, user]
        );
        const reward = rows[0];
        if (!reward) fail("No reward belongs to this player.");
        if (reward.claimed_at != null) return { alreadyClaimed: true, amount: Number(reward.amount), balance: Number(reward.balance_after), items: reward.item_receipts ?? [] };
        const amount = Number(reward.amount);
        const { rows: credited } = await client.query(
          `UPDATE public.accounts SET balance = balance + $1
           WHERE guild_id = $2 AND user_id = $3 AND balance <= $4 RETURNING balance`,
          [amount, guild, user, MAX_BALANCE - amount]
        );
        if (!credited[0]) fail("Your balance is too high to claim. The reward remains saved.");
        const balance = Number(credited[0].balance);
        if (!Number.isSafeInteger(balance)) fail("Invalid account balance.");
        const granted = await grantDungeonLoot(client, guild, user, reward.loot, items);
        await client.query(
          `UPDATE public.dungeon_rewards SET claimed_at = $1, balance_after = $2,
           item_receipts = $5::jsonb WHERE run_id = $3 AND user_id = $4`,
          [clock(), balance, id, user, JSON.stringify(granted)]
        );
        return { alreadyClaimed: false, amount, balance, items: granted };
      }
      if (!["invited", "active"].includes(run.status)) return null;
      if (round !== run.state.round) fail("That panel is from an older round. Press Refresh or use !dungeon.");
      if (run.status === "invited") {
        if (action === "decline" || action === "leave") {
          run.status = "declined"; run.state.status = "declined"; run.expires_at = 0;
          await save(client, run); await releaseParty(client, run); return null;
        }
        if (action !== "accept" || user !== run.partner_id) fail("Only the invited player can accept.");
        const users = run.party_ids;
        for (const player of users) {
          const { rows } = await client.query(
            "SELECT run_id, next_entry_at FROM public.dungeon_members WHERE guild_id = $1 AND user_id = $2 FOR UPDATE", [guild, player]
          );
          if (rows[0]?.run_id !== id) fail("This invitation is no longer active.");
          if (Number(rows[0].next_entry_at) > clock()) fail("A player's dungeon cooldown is still active.");
        }
        const players = users.map((player) => {
          const account = accounts.get(player);
          return makePlayer(player, account.weapon_item_id, account.armor_item_id, items, run.state.rules);
        });
        const difficulty = run.state.difficulty;
        const lootTable = run.state.lootTable ?? null;
        run.state = startState(run.state.dungeon, players, run.state.rules);
        run.state.difficulty = difficulty;
        run.state.lootTable = lootTable;
        run.status = "active";
        run.expires_at = clock() + run.state.rules.roundMs;
        for (const player of users) {
          await client.query(
            "UPDATE public.dungeon_members SET next_entry_at = $1 WHERE guild_id = $2 AND user_id = $3",
            [clock() + run.state.rules.cooldownMs, guild, player]
          );
        }
      } else if (action === "leave") {
        run.status = "retreated"; run.state.status = "retreated"; run.expires_at = 0;
        run.state.log = ["A player retreated. No clear reward was earned; the entry cooldown remains."];
        await releaseParty(client, run);
      } else {
        const player = run.state.players.find((member) => member.userId === user);
        validateChoice(player, action);
        player.choice = action;
        if (run.state.players.filter((member) => member.hp > 0).every((member) => member.choice)) {
          run.state = resolveRound(run.state, rng);
          run.status = run.state.status;
          run.expires_at = run.status === "active" ? clock() + run.state.rules.roundMs : 0;
          if (run.status !== "active") {
            await releaseParty(client, run);
            if (run.status === "won") {
              for (const recipient of run.party_ids) {
                const loot = rollDungeonLoot(run.state.lootTable, lootRng);
                await client.query(
                  `INSERT INTO public.dungeon_rewards (run_id, guild_id, user_id, amount, loot, loot_rolled)
                   VALUES ($1, $2, $3, $4, $5::jsonb, $6) ON CONFLICT (run_id, user_id) DO NOTHING`,
                  [id, guild, recipient, run.state.dungeon.reward, JSON.stringify(loot), run.state.lootTable != null]
                );
              }
            }
          }
        }
      }
      await save(client, run);
      return null;
    });
  }

  async function current(guild, user, rewardsOnly = false) {
    // The lookup is read-only; the matching run is revalidated in mutate().
    const { rows } = rewardsOnly
      ? await db.query(
        `SELECT r.id FROM public.dungeon_rewards d JOIN public.dungeon_runs r ON r.id = d.run_id
         WHERE d.guild_id = $1 AND d.user_id = $2 AND d.claimed_at IS NULL ORDER BY r.created_at LIMIT 1`, [guild, user])
      : await db.query("SELECT run_id AS id FROM public.dungeon_members WHERE guild_id = $1 AND user_id = $2 AND run_id IS NOT NULL", [guild, user]);
    if (!rows[0]) return null;
    return (await act(guild, user, rows[0].id, 0, "refresh")).run;
  }

  return { create, act, current };
}
