import { createHash, randomInt } from "node:crypto";
import { fishingConfig } from "../src/config/fishing.js";

export class FishingError extends Error {}
const fail = (message) => { throw new FishingError(message); };

export function createFishingStore(db,config=fishingConfig,{rng=randomInt,clock=Date.now}={}) {
  function validate() {
    if(!Number.isSafeInteger(config.cooldownMs) || config.cooldownMs<1000) fail("Invalid fishing cooldown.");
    if(!Array.isArray(config.fish) || !config.fish.length || new Set(config.fish.map(f=>f.id)).size!==config.fish.length) {
      fail("Define at least one fish with unique IDs.");
    }
    for(const fish of config.fish) {
      if(!/^[a-z0-9_-]+$/.test(fish.id) || !fish.name || !fish.emoji || !fish.rarity ||
        !Number.isSafeInteger(fish.weight) || fish.weight<=0 ||
        !Number.isSafeInteger(fish.sellValue) || fish.sellValue<1 || fish.sellValue>1_000_000) {
        fail("Invalid fish definition.");
      }
    }
    const weight=config.fish.reduce((sum,fish)=>sum+fish.weight,0);
    if(!Number.isSafeInteger(weight) || weight>1_000_000_000) fail("Invalid total fish weight.");
  }
  function initialize() {
    validate();
    db.exec(`
      CREATE TABLE IF NOT EXISTS fishing_cooldowns (
        guild_id TEXT NOT NULL,user_id TEXT NOT NULL,next_cast_at INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(guild_id,user_id)
      );
      CREATE TABLE IF NOT EXISTS fishing_bag (
        guild_id TEXT NOT NULL,user_id TEXT NOT NULL,item_key TEXT NOT NULL,
        payload TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>0 AND quantity<=1000000),
        PRIMARY KEY(guild_id,user_id,item_key)
      );
      CREATE TABLE IF NOT EXISTS fishing_actions (
        id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,user_id TEXT NOT NULL,
        kind TEXT NOT NULL,target TEXT NOT NULL,result TEXT NOT NULL,created_at INTEGER NOT NULL
      );
      CREATE TRIGGER IF NOT EXISTS fishing_account_deleted AFTER DELETE ON accounts
      BEGIN
        DELETE FROM fishing_cooldowns WHERE guild_id=OLD.guild_id AND user_id=OLD.user_id;
        DELETE FROM fishing_bag WHERE guild_id=OLD.guild_id AND user_id=OLD.user_id;
        DELETE FROM fishing_actions WHERE guild_id=OLD.guild_id AND user_id=OLD.user_id;
      END;
    `);
  }

  function action(requestId,guild,user,kind,target,fn) {
    if(typeof requestId!=="string" || !requestId || requestId.length>100) fail("Invalid request ID.");
    return db.transaction(()=>{
      const old=db.prepare("SELECT * FROM fishing_actions WHERE id=?").get(requestId);
      if(old) {
        if(old.guild_id!==guild || old.user_id!==user || old.kind!==kind || old.target!==target) fail("Request ID mismatch.");
        return JSON.parse(old.result);
      }
      const result=fn();
      db.prepare("INSERT INTO fishing_actions(id,guild_id,user_id,kind,target,result,created_at) VALUES(?,?,?,?,?,?,?)")
        .run(requestId,guild,user,kind,target,JSON.stringify(result),clock());
      return result;
    }).immediate();
  }

  function cast(guild,user,requestId) {
    return action(requestId,guild,user,"cast","-",()=>{
      validate();
      const now=clock();
      const cooldown=db.prepare("SELECT next_cast_at FROM fishing_cooldowns WHERE guild_id=? AND user_id=?").get(guild,user);
      if(cooldown && cooldown.next_cast_at>now) return {caught:false,nextCastAt:cooldown.next_cast_at};
      // Uses your existing account defaults, including level/XP when present.
      db.prepare("INSERT INTO accounts(guild_id,user_id) VALUES(?,?) ON CONFLICT(guild_id,user_id) DO NOTHING").run(guild,user);
      const total=config.fish.reduce((sum,fish)=>sum+fish.weight,0);
      let roll=rng(total);
      if(!Number.isInteger(roll) || roll<0 || roll>=total) fail("Invalid random draw.");
      let picked;
      for(const fish of config.fish) {
        if(roll<fish.weight) {picked=fish;break;}
        roll-=fish.weight;
      }
      const fish={id:picked.id,name:picked.name,emoji:picked.emoji,rarity:picked.rarity,sellValue:picked.sellValue};
      const payload=JSON.stringify(fish);
      const itemKey=createHash("sha256").update(payload).digest("hex").slice(0,32);
      const existing=db.prepare("SELECT quantity FROM fishing_bag WHERE guild_id=? AND user_id=? AND item_key=?").get(guild,user,itemKey);
      if(existing?.quantity>=1_000_000) fail("That fish stack is full. Sell some fish first.");
      db.prepare(`INSERT INTO fishing_bag(guild_id,user_id,item_key,payload,quantity) VALUES(?,?,?,?,1)
        ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=quantity+1`).run(guild,user,itemKey,payload);
      const nextCastAt=now+config.cooldownMs;
      db.prepare(`INSERT INTO fishing_cooldowns(guild_id,user_id,next_cast_at) VALUES(?,?,?)
        ON CONFLICT(guild_id,user_id) DO UPDATE SET next_cast_at=excluded.next_cast_at`).run(guild,user,nextCastAt);
      return {caught:true,fish,itemKey,nextCastAt};
    });
  }

  function allEntries(guild,user) {
    return db.prepare("SELECT * FROM fishing_bag WHERE guild_id=? AND user_id=? ORDER BY item_key").all(guild,user)
      .map(row=>({itemKey:row.item_key,quantity:row.quantity,fish:JSON.parse(row.payload)}));
  }
  function bag(guild,user,page=0) {
    const all=allEntries(guild,user),pages=Math.max(1,Math.ceil(all.length/20));
    page=Number.isSafeInteger(page)?Math.max(0,Math.min(page,pages-1)):0;
    return {page,pages,entries:all.slice(page*20,page*20+20),
      totalFish:all.reduce((sum,row)=>sum+row.quantity,0),
      totalValue:all.reduce((sum,row)=>sum+row.quantity*row.fish.sellValue,0)};
  }
  function entry(guild,user,key) {
    const row=db.prepare("SELECT * FROM fishing_bag WHERE guild_id=? AND user_id=? AND item_key=?").get(guild,user,key);
    if(!row) fail("You no longer have this fish. Refresh !fishbag.");
    return {itemKey:key,quantity:row.quantity,fish:JSON.parse(row.payload)};
  }

  // key=null sells the whole bag. Otherwise quantity is 1 or 'all' of that stack.
  function sell(guild,user,requestId,key=null,quantity="all") {
    if(![1,"all"].includes(quantity) || (key===null && quantity!=="all")) fail("Invalid sale quantity.");
    const target=`${key??"bag"}:${quantity}`;
    return action(requestId,guild,user,"sell",target,()=>{
      const entries=key===null?allEntries(guild,user):[entry(guild,user,key)];
      if(!entries.length) fail("Your fish bag is empty.");
      const selected=entries.map(row=>({...row,sold:quantity===1?1:row.quantity}));
      const earned=selected.reduce((sum,row)=>sum+row.sold*row.fish.sellValue,0);
      const sold=selected.reduce((sum,row)=>sum+row.sold,0);
      if(!Number.isSafeInteger(earned) || earned<=0) fail("Sale value is outside the supported limit.");
      const account=db.prepare(`UPDATE accounts SET balance=balance+?
        WHERE guild_id=? AND user_id=? AND balance<=? RETURNING balance`)
        .get(earned,guild,user,Number.MAX_SAFE_INTEGER-earned);
      if(!account) fail("Could not credit this sale. Check your account and balance limit.");
      for(const row of selected) {
        if(row.sold===row.quantity) db.prepare("DELETE FROM fishing_bag WHERE guild_id=? AND user_id=? AND item_key=?").run(guild,user,row.itemKey);
        else db.prepare("UPDATE fishing_bag SET quantity=quantity-? WHERE guild_id=? AND user_id=? AND item_key=?").run(row.sold,guild,user,row.itemKey);
      }
      return {sold,earned,balance:account.balance};
    });
  }
  return {initialize,cast,bag,entry,sell};
}
