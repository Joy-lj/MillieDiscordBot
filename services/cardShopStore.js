// import { createHash, randomUUID } from "node:crypto";
// import { packDefinitions, rarityGroup } from "../src/config/cardShop.js";
// import { validateOffer, chooseCards } from "./cardPackLogic.js";

// export class CardShopError extends Error {}
// const hash = (value) => createHash("sha256").update(value).digest("hex");
// const fail = (message) => { throw new CardShopError(message); };

// export function createCardShopStore(db, definitions = packDefinitions, rng) {
//   function initialize() {
//     db.exec(`
//       CREATE TABLE IF NOT EXISTS card_catalog (
//         card_key TEXT PRIMARY KEY, api_id TEXT NOT NULL, set_id TEXT NOT NULL,
//         rarity TEXT NOT NULL, bucket TEXT NOT NULL, payload TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
//       );
//       CREATE INDEX IF NOT EXISTS card_catalog_sets ON card_catalog(set_id,active,bucket);
//       CREATE TABLE IF NOT EXISTS card_packs (
//         id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
//         snapshot TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'unopened'
//           CHECK(state IN ('unopened','opened','sold')), bought_at INTEGER NOT NULL
//       );
//       CREATE INDEX IF NOT EXISTS card_packs_owner ON card_packs(guild_id,user_id,state);
//       CREATE TABLE IF NOT EXISTS card_owned (
//         id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
//         card_key TEXT NOT NULL, pack_id TEXT NOT NULL, acquired_at INTEGER NOT NULL
//       );
//       CREATE INDEX IF NOT EXISTS card_owned_owner ON card_owned(guild_id,user_id,acquired_at);
//       CREATE TABLE IF NOT EXISTS card_actions (
//         id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
//         kind TEXT NOT NULL, target TEXT NOT NULL, result TEXT NOT NULL, created_at INTEGER NOT NULL
//       );
//       CREATE TRIGGER IF NOT EXISTS cardshop_account_deleted AFTER DELETE ON accounts
//       BEGIN
//         DELETE FROM card_owned WHERE guild_id=OLD.guild_id AND user_id=OLD.user_id;
//         DELETE FROM card_packs WHERE guild_id=OLD.guild_id AND user_id=OLD.user_id;
//         DELETE FROM card_actions WHERE guild_id=OLD.guild_id AND user_id=OLD.user_id;
//       END;
//     `);
//   }

//   // New content gets a new key. Old pack snapshots retain immutable catalog rows.
//   function importSet(setId,cards) {
//     if (!Array.isArray(cards) || !cards.length) fail("Cannot import an empty set.");
//     if (new Set(cards.map((card)=>card.id)).size !== cards.length) fail("Duplicate API card IDs in set import.");
//     const prepared = cards.map((card) => {
//       if (!card.id || !card.name || card.set?.id !== setId || !card.image || !card.rarity) {
//         fail(`Incomplete card: ${card.id ?? "unknown"}. No catalog changes made.`);
//       }
//       const payload=JSON.stringify(card);
//       return { key: hash(payload), card, payload, bucket: rarityGroup(card.rarity) };
//     });
//     return db.transaction(() => {
//       db.prepare("UPDATE card_catalog SET active=0 WHERE set_id=?").run(setId);
//       for (const row of prepared) {
//         db.prepare(`INSERT INTO card_catalog(card_key,api_id,set_id,rarity,bucket,payload,active)
//           VALUES(?,?,?,?,?,?,1) ON CONFLICT(card_key) DO UPDATE SET active=1`)
//           .run(row.key,row.card.id,setId,row.card.rarity,row.bucket,row.payload);
//       }
//       return prepared.length;
//     }).immediate();
//   }

//   function snapshotOffer(offer) {
//     validateOffer(offer);
//     const pools={common:[],uncommon:[],rare:[],special:[]};
//     for (const setId of new Set(offer.setIds)) {
//       const sourceRows = db.prepare("SELECT card_key,bucket FROM card_catalog WHERE set_id=? AND active=1 ORDER BY api_id,card_key").all(setId);
//       if (!sourceRows.length) fail(`${offer.name} unavailable: set ${setId} has not been imported.`);
//       for (const row of sourceRows) {
//         pools[row.bucket].push(row.card_key);
//       }
//     }
//     for (const slot of offer.slots) for (const group of Object.keys(slot)) {
//       if (!pools[group].length) fail(`${offer.name} unavailable: no ${group} cards. Run catalog sync or adjust slots.`);
//     }
//     return {...offer,pools};
//   }

//   function offers() {
//     return definitions.map((offer) => {
//       try { const snapshot=snapshotOffer(offer); return {...offer,ready:true,quote:hash(JSON.stringify(snapshot)).slice(0,16),poolSizes:Object.fromEntries(Object.entries(snapshot.pools).map(([k,v])=>[k,v.length]))}; }
//       catch(error) { return {...offer,ready:false,reason:error.message}; }
//     });
//   }

//   function account(guild,user) {
//     const row=db.prepare("SELECT balance FROM accounts WHERE guild_id=? AND user_id=?").get(guild,user);
//     if (!row) fail("No economy account yet. Use !balance or !daily first.");
//     return row;
//   }

//   function action(id,guild,user,kind,target,fn) {
//     if (typeof id!=="string" || !id || id.length>100) fail("Invalid action ID.");
//     return db.transaction(() => {
//       const old=db.prepare("SELECT * FROM card_actions WHERE id=?").get(id);
//       if (old) {
//         if(old.guild_id!==guild || old.user_id!==user || old.kind!==kind || old.target!==target) fail("Action ID mismatch.");
//         return JSON.parse(old.result);
//       }
//       account(guild,user);
//       const result=fn();
//       db.prepare("INSERT INTO card_actions(id,guild_id,user_id,kind,target,result,created_at) VALUES(?,?,?,?,?,?,?)")
//         .run(id,guild,user,kind,target,JSON.stringify(result),Date.now());
//       return result;
//     }).immediate();
//   }

//   function buy(guild,user,offerId,requestId,expectedQuote,quantity=1) {
//     if (![1,5,10].includes(quantity)) fail("Choose 1, 5, or 10 packs.");
//     const purchaseTarget=quantity===1?offerId:`${offerId}*${quantity}`;
//     return action(requestId,guild,user,"buy",purchaseTarget,()=>{
//       const offer=definitions.find((p)=>p.id===offerId);
//       if(!offer) fail("That pack is no longer sold.");
//       const snapshot=snapshotOffer(offer);
//       if (expectedQuote && expectedQuote !== hash(JSON.stringify(snapshot)).slice(0,16)) {
//         fail("This shop offer changed. Refresh !cardshop to see the current price and odds.");
//       }
//       const totalPrice=offer.price*quantity;
//       if (!Number.isSafeInteger(totalPrice)) fail("Purchase total exceeds the supported limit.");
//       const row=db.prepare(`UPDATE accounts SET balance=balance-?
//         WHERE guild_id=? AND user_id=? AND balance>=? RETURNING balance`)
//         .get(totalPrice,guild,user,totalPrice);
//       if(!row) fail("You don't have enough currency for this purchase.");
//       const packIds=[];
//       const savedSnapshot=JSON.stringify(snapshot);
//       const insert=db.prepare("INSERT INTO card_packs(id,guild_id,user_id,snapshot,bought_at) VALUES(?,?,?,?,?)");
//       const now=Date.now();
//       for(let i=0;i<quantity;i++) {
//         const packId=randomUUID();
//         insert.run(packId,guild,user,savedSnapshot,now);
//         packIds.push(packId);
//       }
//       return {packId:packIds[0],packIds,quantity,name:offer.name,unitPrice:offer.price,price:totalPrice,balance:row.balance};
//     });
//   }

//   function pack(guild,user,id) {
//     const row=db.prepare("SELECT * FROM card_packs WHERE id=? AND guild_id=? AND user_id=? AND state='unopened'").get(id,guild,user);
//     if(!row) fail("That pack is no longer unopened or doesn't belong to you. Refresh !packs.");
//     return {...row,snapshot:JSON.parse(row.snapshot)};
//   }

//   function packGroup(guild,user,packId) {
//     const owned=pack(guild,user,packId);
//     const count=db.prepare(`SELECT COUNT(*) AS n FROM card_packs
//       WHERE guild_id=? AND user_id=? AND state='unopened'
//       AND json_extract(snapshot,'$.id')=?`).get(guild,user,owned.snapshot.id).n;
//     return {owned,count};
//   }

//   function mintPack(guild,user,owned) {
//     const selected=chooseCards(owned.snapshot,rng);
//     const cards=selected.map((key)=>{
//       const row=db.prepare("SELECT payload FROM card_catalog WHERE card_key=?").get(key);
//       if(!row) fail("A saved card is missing. No packs were consumed.");
//       return {key,card:JSON.parse(row.payload),copyId:randomUUID()};
//     });
//     const changed=db.prepare("UPDATE card_packs SET state='opened' WHERE id=? AND state='unopened'").run(owned.id);
//     if(changed.changes!==1) fail("This pack was already used.");
//     for(const item of cards) db.prepare("INSERT INTO card_owned(id,guild_id,user_id,card_key,pack_id,acquired_at) VALUES(?,?,?,?,?,?)")
//       .run(item.copyId,guild,user,item.key,owned.id,Date.now());
//     return cards.map(({card,copyId})=>({card,copyId}));
//   }

//   function openMany(guild,user,packId,requestId,quantity=1) {
//     if(![1,5,10,"all"].includes(quantity)) fail("Choose 1, 5, 10, or all packs.");
//     const target=quantity===1?packId:`${packId}*${quantity}`;
//     return action(requestId,guild,user,"open",target,()=>{
//       const anchor=pack(guild,user,packId);
//       const rows=db.prepare(`SELECT * FROM card_packs
//         WHERE guild_id=? AND user_id=? AND state='unopened'
//         AND json_extract(snapshot,'$.id')=?
//         ORDER BY CASE WHEN id=? THEN 0 ELSE 1 END,bought_at,id
//         LIMIT ?`).all(guild,user,anchor.snapshot.id,packId,quantity==="all"?-1:quantity);
//       if(quantity!=="all" && rows.length<quantity) {
//         fail(`You need ${quantity} unopened ${anchor.snapshot.name} packs. No packs were consumed.`);
//       }
//       const cards=[];
//       for(const item of rows) cards.push(...mintPack(guild,user,{...item,snapshot:JSON.parse(item.snapshot)}));
//       return {packId,packIds:rows.map((item)=>item.id),quantity:rows.length,name:anchor.snapshot.name,cards};
//     });
//   }

//   function open(guild,user,packId,requestId) {
//     return openMany(guild,user,packId,requestId,1);
//   }

//   function sell(guild,user,packId,requestId) {
//     return action(requestId,guild,user,"sell",packId,()=>{
//       const owned=pack(guild,user,packId);
//       const price=owned.snapshot.sellPrice;
//       const row=db.prepare(`UPDATE accounts SET balance=balance+?
//         WHERE guild_id=? AND user_id=? AND balance<=? RETURNING balance`)
//         .get(price,guild,user,Number.MAX_SAFE_INTEGER-price);
//       if(!row) fail("This sale would exceed your balance limit.");
//       const changed=db.prepare("UPDATE card_packs SET state='sold' WHERE id=? AND state='unopened'").run(packId);
//       if(changed.changes!==1) fail("This pack was already used.");
//       return {packId,name:owned.snapshot.name,price,balance:row.balance};
//     });
//   }

//   function listPacks(guild,user,page=0) {
//     const total=db.prepare("SELECT COUNT(*) AS n FROM card_packs WHERE guild_id=? AND user_id=? AND state='unopened'").get(guild,user).n;
//     const pages=Math.max(1,Math.ceil(total/10)); page=Math.max(0,Math.min(page,pages-1));
//     const rows=db.prepare(`SELECT * FROM card_packs WHERE guild_id=? AND user_id=? AND state='unopened'
//       ORDER BY bought_at DESC,id LIMIT 10 OFFSET ?`).all(guild,user,page*10);
//     return {total,page,pages,rows:rows.map((row)=>({...row,snapshot:JSON.parse(row.snapshot)}))};
//   }

//   function listCards(guild,user,page=0) {
//     const total=db.prepare("SELECT COUNT(*) AS n FROM card_owned WHERE guild_id=? AND user_id=?").get(guild,user).n;
//     const pageSize=50;
//     const pages=Math.max(1,Math.ceil(total/pageSize));
//     page=Number.isSafeInteger(page)?Math.max(0,Math.min(page,pages-1)):0;
//     const rows=db.prepare(`SELECT o.*,c.payload FROM card_owned o JOIN card_catalog c ON c.card_key=o.card_key
//       WHERE o.guild_id=? AND o.user_id=? ORDER BY o.acquired_at DESC,o.id LIMIT ? OFFSET ?`).all(guild,user,pageSize,page*pageSize);
//     const items=rows.map((row)=>({copyId:row.id,card:JSON.parse(row.payload)}));
//     return {total,page,pages,pageSize,items,item:items[0]??null};
//   }

//   function ownedCard(guild,user,copyId) {
//     const row=db.prepare(`SELECT o.id,c.payload FROM card_owned o JOIN card_catalog c ON c.card_key=o.card_key
//       WHERE o.id=? AND o.guild_id=? AND o.user_id=?`).get(copyId,guild,user);
//     if(!row) fail("This card is no longer in your collection. Refresh !cards.");
//     return {copyId:row.id,card:JSON.parse(row.payload)};
//   }

//   function opening(guild,user,id) {
//     const row=db.prepare("SELECT result FROM card_actions WHERE id=? AND guild_id=? AND user_id=? AND kind='open'").get(id,guild,user);
//     if(!row) fail("This opening is no longer available.");
//     return JSON.parse(row.result);
//   }

//   return {initialize,importSet,offers,buy,open,sell,pack,listPacks,listCards,ownedCard,opening,packGroup,openMany};
// }

import { createHash, randomUUID } from "node:crypto";
import { packDefinitions, rarityGroup } from "../src/config/cardShop.js";
import { validateOffer, chooseCards } from "./cardPackLogic.js";

export class CardShopError extends Error { }
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fail = (message) => { throw new CardShopError(message); };
const MAX_BALANCE = Number.MAX_SAFE_INTEGER;
const GROUPS = ["common", "uncommon", "rare", "special"];

function number(value, name) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) fail(`Invalid ${name}.`);
  return result;
}

const decodePack = (row) => ({
  ...row,
  bought_at: number(row.bought_at, "purchase timestamp"),
  snapshot: JSON.parse(row.snapshot),
});

export function createCardShopStore(db, definitions = packDefinitions, rng) {
  async function transaction(fn, readOnly = false) {
    const client = await db.connect();
    try {
      await client.query(readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); }
      catch (rollbackError) { console.error("Card shop rollback failed:", rollbackError); }
      throw error;
    } finally {
      client.release();
    }
  }

  async function advisoryLock(client, namespace, id) {
    const key = createHash("sha256").update(`${namespace}:${id}`)
      .digest().readBigInt64BE(0).toString();
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [key]);
  }

  async function initialize() {
    // Create tables separately by running cardshop.sql in Supabase.
    if (!Array.isArray(definitions)) fail("Invalid pack definitions.");
    for (const offer of definitions) validateOffer(offer);
    if (new Set(definitions.map((offer) => offer.id)).size !== definitions.length) {
      fail("Pack IDs must be unique.");
    }
    await db.query("SELECT guild_id, user_id, balance FROM public.accounts LIMIT 0");
    await db.query("SELECT card_key, api_id, set_id, rarity, bucket, payload, active FROM public.card_catalog LIMIT 0");
    await db.query("SELECT id, guild_id, user_id, snapshot, state, bought_at FROM public.card_packs LIMIT 0");
    await db.query("SELECT id, guild_id, user_id, card_key, pack_id, acquired_at FROM public.card_owned LIMIT 0");
    await db.query("SELECT id, guild_id, user_id, kind, target, result, created_at FROM public.card_actions LIMIT 0");
  }

  // Immutable metadata keys preserve cards referenced by older pack snapshots.
  async function importSet(setId, cards) {
    if (typeof setId !== "string" || !setId) fail("Invalid source set.");
    if (!Array.isArray(cards) || !cards.length) fail("Cannot import an empty set.");
    if (cards.some((card) => !card || typeof card !== "object")) fail("Invalid card data.");
    if (new Set(cards.map((card) => card.id)).size !== cards.length) {
      fail("Duplicate API card IDs in set import.");
    }
    const prepared = cards.map((card) => {
      if (typeof card.id !== "string" || !card.id || !card.name ||
        card.set?.id !== setId || !card.image || !card.rarity) {
        fail(`Incomplete card: ${card.id ?? "unknown"}. No catalog changes made.`);
      }
      const payload = JSON.stringify(card);
      const bucket = rarityGroup(card.rarity);
      if (!GROUPS.includes(bucket)) fail("Invalid rarity group.");
      return { key: hash(payload), card, payload, bucket };
    });
    return transaction(async (client) => {
      // Prevent simultaneous imports of one set from mixing active revisions.
      await advisoryLock(client, "cardshop:catalog", setId);
      await client.query("UPDATE public.card_catalog SET active = 0 WHERE set_id = $1", [setId]);
      for (const row of prepared) {
        await client.query(
          `INSERT INTO public.card_catalog
           (card_key, api_id, set_id, rarity, bucket, payload, active)
           VALUES ($1, $2, $3, $4, $5, $6, 1)
           ON CONFLICT (card_key) DO UPDATE SET active = 1`,
          [row.key, row.card.id, setId, row.card.rarity, row.bucket, row.payload]
        );
      }
      return prepared.length;
    });
  }

  async function snapshotOffer(client, offer) {
    validateOffer(offer);
    // One query sees one committed catalog revision across all source sets.
    const setIds = [...new Set(offer.setIds)];
    const { rows } = await client.query(
      `SELECT card_key, set_id, bucket FROM public.card_catalog
       WHERE set_id = ANY($1::text[]) AND active = 1
       ORDER BY api_id, card_key`, [setIds]
    );
    const pools = { common: [], uncommon: [], rare: [], special: [] };
    for (const setId of setIds) {
      const sourceRows = rows.filter((row) => row.set_id === setId);
      if (!sourceRows.length) fail(`${offer.name} unavailable: set ${setId} has not been imported.`);
      for (const row of sourceRows) {
        if (!GROUPS.includes(row.bucket)) fail("Invalid catalog rarity group.");
        pools[row.bucket].push(row.card_key);
      }
    }
    for (const slot of offer.slots) {
      for (const group of Object.keys(slot)) {
        if (!pools[group].length) {
          fail(`${offer.name} unavailable: no ${group} cards. Run catalog sync or adjust slots.`);
        }
      }
    }
    return { ...offer, pools };
  }

  async function offers() {
    const result = [];
    for (const offer of definitions) {
      try {
        const snapshot = await snapshotOffer(db, offer);
        result.push({
          ...offer, ready: true, quote: hash(JSON.stringify(snapshot)).slice(0, 16),
          poolSizes: Object.fromEntries(Object.entries(snapshot.pools).map(([key, values]) => [key, values.length])),
        });
      } catch (error) {
        // Connection failures should reach the command error handler.
        if (!(error instanceof CardShopError)) throw error;
        result.push({ ...offer, ready: false, reason: error.message });
      }
    }
    return result;
  }

  async function action(id, guild, user, kind, target, fn) {
    if (typeof id !== "string" || !id || id.length > 100) fail("Invalid action ID.");
    return transaction(async (client) => {
      // Serialize retries before looking up their durable receipts.
      await advisoryLock(client, "cardshop:request", id);
      const { rows: previous } = await client.query(
        "SELECT * FROM public.card_actions WHERE id = $1", [id]
      );
      const old = previous[0];
      if (old) {
        if (old.guild_id !== guild || old.user_id !== user || old.kind !== kind || old.target !== target) {
          fail("Action ID mismatch.");
        }
        return JSON.parse(old.result);
      }
      const { rows: accounts } = await client.query(
        `SELECT balance FROM public.accounts
         WHERE guild_id = $1 AND user_id = $2 FOR UPDATE`, [guild, user]
      );
      if (!accounts[0]) fail("No economy account yet. Use !balance or !daily first.");
      number(accounts[0].balance, "balance");
      const result = await fn(client);
      await client.query(
        `INSERT INTO public.card_actions
         (id, guild_id, user_id, kind, target, result, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, guild, user, kind, target, JSON.stringify(result), Date.now()]
      );
      return result;
    });
  }

  async function buy(guild, user, offerId, requestId, expectedQuote, quantity = 1) {
    if (![1, 5, 10].includes(quantity)) fail("Choose 1, 5, or 10 packs.");
    const target = quantity === 1 ? offerId : `${offerId}*${quantity}`;
    return action(requestId, guild, user, "buy", target, async (client) => {
      const offer = definitions.find((pack) => pack.id === offerId);
      if (!offer) fail("That pack is no longer sold.");
      const snapshot = await snapshotOffer(client, offer);
      if (expectedQuote && expectedQuote !== hash(JSON.stringify(snapshot)).slice(0, 16)) {
        fail("This shop offer changed. Refresh !cardshop to see the current price and odds.");
      }
      const totalPrice = offer.price * quantity;
      if (!Number.isSafeInteger(totalPrice)) fail("Purchase total exceeds the supported limit.");
      const { rows } = await client.query(
        `UPDATE public.accounts SET balance = balance - $1
         WHERE guild_id = $2 AND user_id = $3 AND balance >= $1 RETURNING balance`,
        [totalPrice, guild, user]
      );
      if (!rows[0]) fail("You don't have enough currency for this purchase.");
      const packIds = [];
      const savedSnapshot = JSON.stringify(snapshot);
      const now = Date.now();
      for (let i = 0; i < quantity; i += 1) {
        const packId = randomUUID();
        await client.query(
          `INSERT INTO public.card_packs (id, guild_id, user_id, snapshot, bought_at)
           VALUES ($1, $2, $3, $4, $5)`, [packId, guild, user, savedSnapshot, now]
        );
        packIds.push(packId);
      }
      return {
        packId: packIds[0], packIds, quantity, name: offer.name, unitPrice: offer.price,
        price: totalPrice, balance: number(rows[0].balance, "balance"),
      };
    });
  }

  async function readPack(client, guild, user, id) {
    const { rows } = await client.query(
      `SELECT * FROM public.card_packs
       WHERE id = $1 AND guild_id = $2 AND user_id = $3 AND state = 'unopened'`,
      [id, guild, user]
    );
    if (!rows[0]) fail("That pack is no longer unopened or doesn't belong to you. Refresh !packs.");
    return decodePack(rows[0]);
  }

  async function pack(guild, user, id) {
    return readPack(db, guild, user, id);
  }

  async function packGroup(guild, user, packId) {
    return transaction(async (client) => {
      const owned = await readPack(client, guild, user, packId);
      const { rows } = await client.query(
        `SELECT COUNT(*) AS n FROM public.card_packs
         WHERE guild_id = $1 AND user_id = $2 AND state = 'unopened'
           AND snapshot::jsonb ->> 'id' = $3`, [guild, user, owned.snapshot.id]
      );
      return { owned, count: number(rows[0].n, "pack count") };
    }, true);
  }

  async function mintPack(client, guild, user, owned) {
    const selected = chooseCards(owned.snapshot, rng);
    const { rows: catalog } = await client.query(
      "SELECT card_key, payload FROM public.card_catalog WHERE card_key = ANY($1::text[])", [selected]
    );
    const byKey = new Map(catalog.map((row) => [row.card_key, row.payload]));
    const cards = selected.map((key) => {
      if (!byKey.has(key)) fail("A saved card is missing. No packs were consumed.");
      return { key, card: JSON.parse(byKey.get(key)), copyId: randomUUID() };
    });
    const changed = await client.query(
      `UPDATE public.card_packs SET state = 'opened'
       WHERE id = $1 AND guild_id = $2 AND user_id = $3 AND state = 'unopened'
       RETURNING id`, [owned.id, guild, user]
    );
    if (changed.rows.length !== 1) fail("This pack was already used.");
    const now = Date.now();
    for (const item of cards) {
      await client.query(
        `INSERT INTO public.card_owned
         (id, guild_id, user_id, card_key, pack_id, acquired_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [item.copyId, guild, user, item.key, owned.id, now]
      );
    }
    return cards.map(({ card, copyId }) => ({ card, copyId }));
  }

  async function openMany(guild, user, packId, requestId, quantity = 1) {
    if (![1, 5, 10, "all"].includes(quantity)) fail("Choose 1, 5, 10, or all packs.");
    const target = quantity === 1 ? packId : `${packId}*${quantity}`;
    return action(requestId, guild, user, "open", target, async (client) => {
      const anchor = await readPack(client, guild, user, packId);
      const { rows } = await client.query(
        `SELECT * FROM public.card_packs
         WHERE guild_id = $1 AND user_id = $2 AND state = 'unopened'
           AND snapshot::jsonb ->> 'id' = $3
         ORDER BY CASE WHEN id = $4 THEN 0 ELSE 1 END, bought_at, id
         LIMIT $5 FOR UPDATE`,
        [guild, user, anchor.snapshot.id, packId, quantity === "all" ? null : quantity]
      );
      if (quantity !== "all" && rows.length < quantity) {
        fail(`You need ${quantity} unopened ${anchor.snapshot.name} packs. No packs were consumed.`);
      }
      const cards = [];
      for (const row of rows) {
        cards.push(...await mintPack(client, guild, user, decodePack(row)));
      }
      return { packId, packIds: rows.map((row) => row.id), quantity: rows.length, name: anchor.snapshot.name, cards };
    });
  }

  async function open(guild, user, packId, requestId) {
    return openMany(guild, user, packId, requestId, 1);
  }

  async function sell(guild, user, packId, requestId) {
    return action(requestId, guild, user, "sell", packId, async (client) => {
      const owned = await readPack(client, guild, user, packId);
      const price = number(owned.snapshot.sellPrice, "saved sell price");
      const { rows } = await client.query(
        `UPDATE public.accounts SET balance = balance + $1
         WHERE guild_id = $2 AND user_id = $3 AND balance <= $4 RETURNING balance`,
        [price, guild, user, MAX_BALANCE - price]
      );
      if (!rows[0]) fail("This sale would exceed your balance limit.");
      const changed = await client.query(
        `UPDATE public.card_packs SET state = 'sold'
         WHERE id = $1 AND guild_id = $2 AND user_id = $3 AND state = 'unopened'
         RETURNING id`, [packId, guild, user]
      );
      if (changed.rows.length !== 1) fail("This pack was already used.");
      return { packId, name: owned.snapshot.name, price, balance: number(rows[0].balance, "balance") };
    });
  }

  async function listPacks(guild, user, page = 0) {
    return transaction(async (client) => {
      const { rows: counts } = await client.query(
        `SELECT COUNT(*) AS n FROM public.card_packs
         WHERE guild_id = $1 AND user_id = $2 AND state = 'unopened'`, [guild, user]
      );
      const total = number(counts[0].n, "pack count");
      const pages = Math.max(1, Math.ceil(total / 10));
      page = Number.isSafeInteger(page) ? Math.max(0, Math.min(page, pages - 1)) : 0;
      const { rows } = await client.query(
        `SELECT * FROM public.card_packs
         WHERE guild_id = $1 AND user_id = $2 AND state = 'unopened'
         ORDER BY bought_at DESC, id LIMIT 10 OFFSET $3`, [guild, user, page * 10]
      );
      return { total, page, pages, rows: rows.map(decodePack) };
    }, true);
  }

  async function listCards(guild, user, page = 0) {
    return transaction(async (client) => {
      const { rows: counts } = await client.query(
        "SELECT COUNT(*) AS n FROM public.card_owned WHERE guild_id = $1 AND user_id = $2", [guild, user]
      );
      const total = number(counts[0].n, "card count");
      const pageSize = 50;
      const pages = Math.max(1, Math.ceil(total / pageSize));
      page = Number.isSafeInteger(page) ? Math.max(0, Math.min(page, pages - 1)) : 0;
      const { rows } = await client.query(
        `SELECT o.id, c.payload FROM public.card_owned o
         JOIN public.card_catalog c ON c.card_key = o.card_key
         WHERE o.guild_id = $1 AND o.user_id = $2
         ORDER BY o.acquired_at DESC, o.id LIMIT $3 OFFSET $4`,
        [guild, user, pageSize, page * pageSize]
      );
      const items = rows.map((row) => ({ copyId: row.id, card: JSON.parse(row.payload) }));
      return { total, page, pages, pageSize, items, item: items[0] ?? null };
    }, true);
  }

  async function ownedCard(guild, user, copyId) {
    const { rows } = await db.query(
      `SELECT o.id, c.payload FROM public.card_owned o
       JOIN public.card_catalog c ON c.card_key = o.card_key
       WHERE o.id = $1 AND o.guild_id = $2 AND o.user_id = $3`, [copyId, guild, user]
    );
    if (!rows[0]) fail("This card is no longer in your collection. Refresh !cards.");
    return { copyId: rows[0].id, card: JSON.parse(rows[0].payload) };
  }

  async function opening(guild, user, id) {
    const { rows } = await db.query(
      `SELECT result FROM public.card_actions
       WHERE id = $1 AND guild_id = $2 AND user_id = $3 AND kind = 'open'`, [id, guild, user]
    );
    if (!rows[0]) fail("This opening is no longer available.");
    return JSON.parse(rows[0].result);
  }

  return { initialize, importSet, offers, buy, open, sell, pack, listPacks, listCards, ownedCard, opening, packGroup, openMany };
}
