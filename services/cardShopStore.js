import { createHash, randomUUID } from "node:crypto";
import { packDefinitions, rarityGroup } from "../src/config/cardShop.js";
import { validateOffer, chooseCards } from "./cardPackLogic.js";

export class CardShopError extends Error {}
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fail = (message) => { throw new CardShopError(message); };

export function createCardShopStore(db, definitions = packDefinitions, rng) {
  function initialize() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS card_catalog (
        card_key TEXT PRIMARY KEY, api_id TEXT NOT NULL, set_id TEXT NOT NULL,
        rarity TEXT NOT NULL, bucket TEXT NOT NULL, payload TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS card_catalog_sets ON card_catalog(set_id,active,bucket);
      CREATE TABLE IF NOT EXISTS card_packs (
        id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
        snapshot TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'unopened'
          CHECK(state IN ('unopened','opened','sold')), bought_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS card_packs_owner ON card_packs(guild_id,user_id,state);
      CREATE TABLE IF NOT EXISTS card_owned (
        id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
        card_key TEXT NOT NULL, pack_id TEXT NOT NULL, acquired_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS card_owned_owner ON card_owned(guild_id,user_id,acquired_at);
      CREATE TABLE IF NOT EXISTS card_actions (
        id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
        kind TEXT NOT NULL, target TEXT NOT NULL, result TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE TRIGGER IF NOT EXISTS cardshop_account_deleted AFTER DELETE ON accounts
      BEGIN
        DELETE FROM card_owned WHERE guild_id=OLD.guild_id AND user_id=OLD.user_id;
        DELETE FROM card_packs WHERE guild_id=OLD.guild_id AND user_id=OLD.user_id;
        DELETE FROM card_actions WHERE guild_id=OLD.guild_id AND user_id=OLD.user_id;
      END;
    `);
  }

  // New content gets a new key. Old pack snapshots retain immutable catalog rows.
  function importSet(setId,cards) {
    if (!Array.isArray(cards) || !cards.length) fail("Cannot import an empty set.");
    if (new Set(cards.map((card)=>card.id)).size !== cards.length) fail("Duplicate API card IDs in set import.");
    const prepared = cards.map((card) => {
      if (!card.id || !card.name || card.set?.id !== setId || !card.image || !card.rarity) {
        fail(`Incomplete card: ${card.id ?? "unknown"}. No catalog changes made.`);
      }
      const payload=JSON.stringify(card);
      return { key: hash(payload), card, payload, bucket: rarityGroup(card.rarity) };
    });
    return db.transaction(() => {
      db.prepare("UPDATE card_catalog SET active=0 WHERE set_id=?").run(setId);
      for (const row of prepared) {
        db.prepare(`INSERT INTO card_catalog(card_key,api_id,set_id,rarity,bucket,payload,active)
          VALUES(?,?,?,?,?,?,1) ON CONFLICT(card_key) DO UPDATE SET active=1`)
          .run(row.key,row.card.id,setId,row.card.rarity,row.bucket,row.payload);
      }
      return prepared.length;
    }).immediate();
  }

  function snapshotOffer(offer) {
    validateOffer(offer);
    const pools={common:[],uncommon:[],rare:[],special:[]};
    for (const setId of new Set(offer.setIds)) {
      const sourceRows = db.prepare("SELECT card_key,bucket FROM card_catalog WHERE set_id=? AND active=1 ORDER BY api_id,card_key").all(setId);
      if (!sourceRows.length) fail(`${offer.name} unavailable: set ${setId} has not been imported.`);
      for (const row of sourceRows) {
        pools[row.bucket].push(row.card_key);
      }
    }
    for (const slot of offer.slots) for (const group of Object.keys(slot)) {
      if (!pools[group].length) fail(`${offer.name} unavailable: no ${group} cards. Run catalog sync or adjust slots.`);
    }
    return {...offer,pools};
  }

  function offers() {
    return definitions.map((offer) => {
      try { const snapshot=snapshotOffer(offer); return {...offer,ready:true,quote:hash(JSON.stringify(snapshot)).slice(0,16),poolSizes:Object.fromEntries(Object.entries(snapshot.pools).map(([k,v])=>[k,v.length]))}; }
      catch(error) { return {...offer,ready:false,reason:error.message}; }
    });
  }

  function account(guild,user) {
    const row=db.prepare("SELECT balance FROM accounts WHERE guild_id=? AND user_id=?").get(guild,user);
    if (!row) fail("No economy account yet. Use !balance or !daily first.");
    return row;
  }

  function action(id,guild,user,kind,target,fn) {
    if (typeof id!=="string" || !id || id.length>100) fail("Invalid action ID.");
    return db.transaction(() => {
      const old=db.prepare("SELECT * FROM card_actions WHERE id=?").get(id);
      if (old) {
        if(old.guild_id!==guild || old.user_id!==user || old.kind!==kind || old.target!==target) fail("Action ID mismatch.");
        return JSON.parse(old.result);
      }
      account(guild,user);
      const result=fn();
      db.prepare("INSERT INTO card_actions(id,guild_id,user_id,kind,target,result,created_at) VALUES(?,?,?,?,?,?,?)")
        .run(id,guild,user,kind,target,JSON.stringify(result),Date.now());
      return result;
    }).immediate();
  }

  function buy(guild,user,offerId,requestId,expectedQuote,quantity=1) {
    if (![1,5,10].includes(quantity)) fail("Choose 1, 5, or 10 packs.");
    const purchaseTarget=quantity===1?offerId:`${offerId}*${quantity}`;
    return action(requestId,guild,user,"buy",purchaseTarget,()=>{
      const offer=definitions.find((p)=>p.id===offerId);
      if(!offer) fail("That pack is no longer sold.");
      const snapshot=snapshotOffer(offer);
      if (expectedQuote && expectedQuote !== hash(JSON.stringify(snapshot)).slice(0,16)) {
        fail("This shop offer changed. Refresh !cardshop to see the current price and odds.");
      }
      const totalPrice=offer.price*quantity;
      if (!Number.isSafeInteger(totalPrice)) fail("Purchase total exceeds the supported limit.");
      const row=db.prepare(`UPDATE accounts SET balance=balance-?
        WHERE guild_id=? AND user_id=? AND balance>=? RETURNING balance`)
        .get(totalPrice,guild,user,totalPrice);
      if(!row) fail("You don't have enough currency for this purchase.");
      const packIds=[];
      const savedSnapshot=JSON.stringify(snapshot);
      const insert=db.prepare("INSERT INTO card_packs(id,guild_id,user_id,snapshot,bought_at) VALUES(?,?,?,?,?)");
      const now=Date.now();
      for(let i=0;i<quantity;i++) {
        const packId=randomUUID();
        insert.run(packId,guild,user,savedSnapshot,now);
        packIds.push(packId);
      }
      return {packId:packIds[0],packIds,quantity,name:offer.name,unitPrice:offer.price,price:totalPrice,balance:row.balance};
    });
  }

  function pack(guild,user,id) {
    const row=db.prepare("SELECT * FROM card_packs WHERE id=? AND guild_id=? AND user_id=? AND state='unopened'").get(id,guild,user);
    if(!row) fail("That pack is no longer unopened or doesn't belong to you. Refresh !packs.");
    return {...row,snapshot:JSON.parse(row.snapshot)};
  }

  function packGroup(guild,user,packId) {
    const owned=pack(guild,user,packId);
    const count=db.prepare(`SELECT COUNT(*) AS n FROM card_packs
      WHERE guild_id=? AND user_id=? AND state='unopened'
      AND json_extract(snapshot,'$.id')=?`).get(guild,user,owned.snapshot.id).n;
    return {owned,count};
  }

  function mintPack(guild,user,owned) {
    const selected=chooseCards(owned.snapshot,rng);
    const cards=selected.map((key)=>{
      const row=db.prepare("SELECT payload FROM card_catalog WHERE card_key=?").get(key);
      if(!row) fail("A saved card is missing. No packs were consumed.");
      return {key,card:JSON.parse(row.payload),copyId:randomUUID()};
    });
    const changed=db.prepare("UPDATE card_packs SET state='opened' WHERE id=? AND state='unopened'").run(owned.id);
    if(changed.changes!==1) fail("This pack was already used.");
    for(const item of cards) db.prepare("INSERT INTO card_owned(id,guild_id,user_id,card_key,pack_id,acquired_at) VALUES(?,?,?,?,?,?)")
      .run(item.copyId,guild,user,item.key,owned.id,Date.now());
    return cards.map(({card,copyId})=>({card,copyId}));
  }

  function openMany(guild,user,packId,requestId,quantity=1) {
    if(![1,5,10,"all"].includes(quantity)) fail("Choose 1, 5, 10, or all packs.");
    const target=quantity===1?packId:`${packId}*${quantity}`;
    return action(requestId,guild,user,"open",target,()=>{
      const anchor=pack(guild,user,packId);
      const rows=db.prepare(`SELECT * FROM card_packs
        WHERE guild_id=? AND user_id=? AND state='unopened'
        AND json_extract(snapshot,'$.id')=?
        ORDER BY CASE WHEN id=? THEN 0 ELSE 1 END,bought_at,id
        LIMIT ?`).all(guild,user,anchor.snapshot.id,packId,quantity==="all"?-1:quantity);
      if(quantity!=="all" && rows.length<quantity) {
        fail(`You need ${quantity} unopened ${anchor.snapshot.name} packs. No packs were consumed.`);
      }
      const cards=[];
      for(const item of rows) cards.push(...mintPack(guild,user,{...item,snapshot:JSON.parse(item.snapshot)}));
      return {packId,packIds:rows.map((item)=>item.id),quantity:rows.length,name:anchor.snapshot.name,cards};
    });
  }

  function open(guild,user,packId,requestId) {
    return openMany(guild,user,packId,requestId,1);
  }

  function sell(guild,user,packId,requestId) {
    return action(requestId,guild,user,"sell",packId,()=>{
      const owned=pack(guild,user,packId);
      const price=owned.snapshot.sellPrice;
      const row=db.prepare(`UPDATE accounts SET balance=balance+?
        WHERE guild_id=? AND user_id=? AND balance<=? RETURNING balance`)
        .get(price,guild,user,Number.MAX_SAFE_INTEGER-price);
      if(!row) fail("This sale would exceed your balance limit.");
      const changed=db.prepare("UPDATE card_packs SET state='sold' WHERE id=? AND state='unopened'").run(packId);
      if(changed.changes!==1) fail("This pack was already used.");
      return {packId,name:owned.snapshot.name,price,balance:row.balance};
    });
  }

  function listPacks(guild,user,page=0) {
    const total=db.prepare("SELECT COUNT(*) AS n FROM card_packs WHERE guild_id=? AND user_id=? AND state='unopened'").get(guild,user).n;
    const pages=Math.max(1,Math.ceil(total/10)); page=Math.max(0,Math.min(page,pages-1));
    const rows=db.prepare(`SELECT * FROM card_packs WHERE guild_id=? AND user_id=? AND state='unopened'
      ORDER BY bought_at DESC,id LIMIT 10 OFFSET ?`).all(guild,user,page*10);
    return {total,page,pages,rows:rows.map((row)=>({...row,snapshot:JSON.parse(row.snapshot)}))};
  }

  function listCards(guild,user,page=0) {
    const total=db.prepare("SELECT COUNT(*) AS n FROM card_owned WHERE guild_id=? AND user_id=?").get(guild,user).n;
    const pageSize=50;
    const pages=Math.max(1,Math.ceil(total/pageSize));
    page=Number.isSafeInteger(page)?Math.max(0,Math.min(page,pages-1)):0;
    const rows=db.prepare(`SELECT o.*,c.payload FROM card_owned o JOIN card_catalog c ON c.card_key=o.card_key
      WHERE o.guild_id=? AND o.user_id=? ORDER BY o.acquired_at DESC,o.id LIMIT ? OFFSET ?`).all(guild,user,pageSize,page*pageSize);
    const items=rows.map((row)=>({copyId:row.id,card:JSON.parse(row.payload)}));
    return {total,page,pages,pageSize,items,item:items[0]??null};
  }

  function ownedCard(guild,user,copyId) {
    const row=db.prepare(`SELECT o.id,c.payload FROM card_owned o JOIN card_catalog c ON c.card_key=o.card_key
      WHERE o.id=? AND o.guild_id=? AND o.user_id=?`).get(copyId,guild,user);
    if(!row) fail("This card is no longer in your collection. Refresh !cards.");
    return {copyId:row.id,card:JSON.parse(row.payload)};
  }

  function opening(guild,user,id) {
    const row=db.prepare("SELECT result FROM card_actions WHERE id=? AND guild_id=? AND user_id=? AND kind='open'").get(id,guild,user);
    if(!row) fail("This opening is no longer available.");
    return JSON.parse(row.result);
  }

  return {initialize,importSet,offers,buy,open,sell,pack,listPacks,listCards,ownedCard,opening,packGroup,openMany};
}
