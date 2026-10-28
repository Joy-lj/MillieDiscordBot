import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createCardShopStore } from "../src/services/cardShopStore.js";
import { validateOffer,chooseGroup } from "../src/services/cardPackLogic.js";
import { rarityGroup } from "../src/config/cardShop.js";
import { CardComponent } from "../src/cards/CardComponent.js";

const offer=()=>({id:"test",name:"Test Pack",setIds:["alpha"],price:100,sellPrice:60,version:1,
  slots:[{common:1},{uncommon:1},{rare:80,special:20}]});
const data=(id,rarity)=>({id,name:`Card ${id}`,rarity,set:{id:"alpha",name:"Fixture Set"},
  image:`https://assets.tcgdex.net/en/fixture/${id}`,category:"Pokemon",hp:100,types:["Grass"]});
const catalog=()=>[data("c","Common"),data("u","Uncommon"),data("r","Rare"),data("s","Ultra Rare")];
function fixture(rng=()=>0) {
  const native=new DatabaseSync(":memory:");
  native.exec(`CREATE TABLE accounts(guild_id TEXT NOT NULL,user_id TEXT NOT NULL,balance INTEGER NOT NULL DEFAULT 0
    CHECK(balance>=0),PRIMARY KEY(guild_id,user_id));
    INSERT INTO accounts VALUES('g','a',1000),('g','b',1000),('other','a',1000);`);
  const db={exec:(sql)=>native.exec(sql),prepare:(sql)=>native.prepare(sql),transaction:(fn)=>({immediate:(...args)=>{
    native.exec("BEGIN IMMEDIATE");
    try{const out=fn(...args);native.exec("COMMIT");return out;}
    catch(error){native.exec("ROLLBACK");throw error;}
  }})};
  const defs=[offer()];
  const store=createCardShopStore(db,defs,rng);store.initialize();store.importSet("alpha",catalog());
  return {native,store,defs,balance:()=>native.prepare("SELECT balance FROM accounts WHERE guild_id='g' AND user_id='a'").get().balance};
}

test("weighted slots hit every exact expected interval",()=>{
  const counts={rare:0,special:0};
  for(let i=0;i<100;i++)counts[chooseGroup({rare:80,special:20},()=>i)]++;
  assert.deepEqual(counts,{rare:80,special:20});
});
test("invalid prices, sell arbitrage, and empty or invalid weights are rejected",()=>{
  for(const change of [{price:0},{price:1.5},{sellPrice:101},{slots:[]},{slots:[{rare:0}]},{slots:[{missing:1}]}]){
    assert.throws(()=>validateOffer({...offer(),...change}));
  }
});
test("source rarity labels are preserved; grouping is case-insensitive",()=>{
  assert.equal(rarityGroup("Rare"),"rare");assert.equal(rarityGroup("Ultra Rare"),"special");
  assert.equal(rarityGroup("Common"),"common");assert.throws(()=>rarityGroup(null));
});
test("buy deducts exactly once and repeated action IDs return the receipt",()=>{
  const f=fixture();const a=f.store.buy("g","a","test","buy");
  assert.equal(f.balance(),900);assert.deepEqual(f.store.buy("g","a","test","buy"),a);
  assert.equal(f.balance(),900);assert.equal(f.store.listPacks("g","a").total,1);f.native.close();
});
test("insufficient funds do not create packs or actions",()=>{
  const f=fixture();f.native.exec("UPDATE accounts SET balance=1 WHERE guild_id='g' AND user_id='a'");
  assert.throws(()=>f.store.buy("g","a","test","bad"),/enough/);
  assert.equal(f.store.listPacks("g","a").total,0);
  assert.equal(f.native.prepare("SELECT COUNT(*) n FROM card_actions").get().n,0);f.native.close();
});
test("missing catalog bucket disables the pack; no silent odds redistribution",()=>{
  const f=fixture();f.store.importSet("alpha",catalog().filter((c)=>c.rarity!=="Ultra Rare"));
  assert.equal(f.store.offers()[0].ready,false);
  assert.throws(()=>f.store.buy("g","a","test","bad"),/no special/);assert.equal(f.balance(),1000);f.native.close();
});
test("opening consumes one pack, preserves rarity, and stores each card copy",()=>{
  const f=fixture();const bought=f.store.buy("g","a","test","buy");
  const result=f.store.open("g","a",bought.packId,"open");
  assert.equal(result.cards.length,3);
  assert.deepEqual(result.cards.map((c)=>c.card.rarity),["Common","Uncommon","Rare"]);
  assert.equal(new Set(result.cards.map((c)=>c.copyId)).size,3);
  assert.equal(f.store.listPacks("g","a").total,0);assert.equal(f.store.listCards("g","a").total,3);
  assert.deepEqual(f.store.open("g","a",bought.packId,"open"),result);
  assert.equal(f.store.listCards("g","a").total,3);f.native.close();
});
test("last weighted interval can award API Special rarity",()=>{
  const f=fixture((n)=>n-1);const bought=f.store.buy("g","a","test","buy");
  assert.equal(f.store.open("g","a",bought.packId,"open").cards[2].card.rarity,"Ultra Rare");f.native.close();
});
test("opened pack cannot be sold or opened again with another action ID",()=>{
  const f=fixture();const b=f.store.buy("g","a","test","buy");f.store.open("g","a",b.packId,"open");
  assert.throws(()=>f.store.sell("g","a",b.packId,"sell"),/no longer unopened/);
  assert.throws(()=>f.store.open("g","a",b.packId,"open2"),/no longer unopened/);
  assert.equal(f.balance(),900);f.native.close();
});
test("selling adds the saved sell price once and prevents opening",()=>{
  const f=fixture();const b=f.store.buy("g","a","test","buy");
  assert.equal(f.store.sell("g","a",b.packId,"sell").price,60);assert.equal(f.balance(),960);
  f.store.sell("g","a",b.packId,"sell");assert.equal(f.balance(),960);
  assert.throws(()=>f.store.open("g","a",b.packId,"open"));f.native.close();
});
test("other users and other guilds cannot operate on a pack",()=>{
  const f=fixture();const b=f.store.buy("g","a","test","buy");
  assert.throws(()=>f.store.open("g","b",b.packId,"steal"));
  assert.throws(()=>f.store.sell("other","a",b.packId,"steal2"));
  assert.equal(f.store.listPacks("g","a").total,1);f.native.close();
});
test("action ID cannot be reused for another actor or operation",()=>{
  const f=fixture();const b=f.store.buy("g","a","test","buy");
  assert.throws(()=>f.store.buy("g","b","test","buy"),/mismatch/);
  assert.throws(()=>f.store.open("g","a",b.packId,"buy"),/mismatch/);f.native.close();
});
test("catalog and config updates do not alter an already purchased pack",()=>{
  const f=fixture();const b=f.store.buy("g","a","test","buy");
  f.defs[0].sellPrice=1;f.defs[0].slots=[{special:1}];
  f.store.importSet("alpha",[data("new","Ultra Rare")]);
  const old=f.store.pack("g","a",b.packId).snapshot;
  assert.equal(old.sellPrice,60);assert.equal(old.slots.length,3);
  const opened=f.store.open("g","a",b.packId,"open");
  assert.equal(opened.cards[0].card.id,"c");f.native.close();
});
test("failed second card insertion rolls back all minted copies and pack consumption",()=>{
  const f=fixture();const b=f.store.buy("g","a","test","buy");
  f.native.exec(`CREATE TRIGGER fail_mint BEFORE INSERT ON card_owned
    WHEN (SELECT COUNT(*) FROM card_owned)>=1 BEGIN SELECT RAISE(ABORT,'forced mint failure');END;`);
  assert.throws(()=>f.store.open("g","a",b.packId,"open"),/forced mint failure/);
  assert.equal(f.store.listCards("g","a").total,0);assert.equal(f.store.listPacks("g","a").total,1);
  f.native.exec("DROP TRIGGER fail_mint");f.store.open("g","a",b.packId,"open");f.native.close();
});
test("failed pack insertion rolls back the balance deduction",()=>{
  const f=fixture();f.native.exec(`CREATE TRIGGER fail_buy BEFORE INSERT ON card_packs
    BEGIN SELECT RAISE(ABORT,'forced buy failure');END;`);
  assert.throws(()=>f.store.buy("g","a","test","buy"),/forced buy failure/);
  assert.equal(f.balance(),1000);f.native.close();
});
test("sell overflow leaves pack unopened",()=>{
  const f=fixture();const b=f.store.buy("g","a","test","buy");
  f.native.prepare("UPDATE accounts SET balance=? WHERE guild_id='g' AND user_id='a'").run(Number.MAX_SAFE_INTEGER);
  assert.throws(()=>f.store.sell("g","a",b.packId,"sell"),/limit/);
  assert.equal(f.store.listPacks("g","a").total,1);f.native.close();
});
test("inventory pagination covers more than ten packs and cannot go out of range",()=>{
  const f=fixture();f.native.exec("UPDATE accounts SET balance=2000 WHERE guild_id='g' AND user_id='a'");
  for(let i=0;i<12;i++)f.store.buy("g","a","test",`buy${i}`);
  assert.equal(f.store.listPacks("g","a",0).rows.length,10);
  assert.equal(f.store.listPacks("g","a",99).rows.length,2);
  assert.equal(f.store.listPacks("g","a",-1).page,0);f.native.close();
});
test("existing wipe account deletion also clears packs, cards, and action history",()=>{
  const f=fixture();const b=f.store.buy("g","a","test","buy");f.store.open("g","a",b.packId,"open");
  f.store.buy("g","a","test","buy2");f.store.buy("other","a","test","otherBuy");
  f.native.exec("DELETE FROM accounts WHERE guild_id='g'");
  assert.equal(f.store.listPacks("g","a").total,0);assert.equal(f.store.listCards("g","a").total,0);
  assert.equal(f.native.prepare("SELECT COUNT(*) n FROM card_actions WHERE guild_id='g'").get().n,0);
  assert.equal(f.store.listPacks("other","a").total,1);f.native.close();
});
test("card component supports missing optional Pokemon fields and Trainer/Energy cards",()=>{
  for(const card of [data("p","Common"),{...data("t","Uncommon"),category:"Trainer",hp:null,types:null},
    {...data("e","Rare"),category:"Energy",attacks:[],description:null}]){
    const tree=CardComponent({card});assert.equal(tree.type,"div");assert.equal(tree.props.style.width,640);
  }
});
test("all configured source sets must be imported before a multi-set pack is sold",()=>{
  const f=fixture();f.defs[0].setIds.push("missing");
  assert.equal(f.store.offers()[0].ready,false);
  assert.throws(()=>f.store.buy("g","a","test","buy"),/has not been imported/);
  assert.equal(f.balance(),1000);f.native.close();
});
test("failed or duplicate source imports preserve the previous active catalog",()=>{
  const f=fixture();
  assert.throws(()=>f.store.importSet("alpha",[data("same","Common"),data("same","Rare")]),/Duplicate/);
  assert.throws(()=>f.store.importSet("alpha",[{id:"broken"}]),/Incomplete/);
  assert.equal(f.store.offers()[0].ready,true);f.native.close();
});
test("stale shop buttons cannot buy at a changed price, odds, or catalog",()=>{
  const f=fixture();const quote=f.store.offers()[0].quote;
  f.defs[0].price=200;
  assert.throws(()=>f.store.buy("g","a","test","buy",quote),/offer changed/);
  assert.equal(f.balance(),1000);assert.equal(f.store.listPacks("g","a").total,0);
  const fresh=f.store.offers()[0].quote;f.store.buy("g","a","test","buy",fresh);
  assert.equal(f.balance(),800);f.native.close();
});
