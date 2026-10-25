import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { flowers } from "../src/config/flowerPoker.js";
import { drawFlower, rankHand, compareHands, flowerProbabilities } from "../src/services/flowerPokerLogic.js";
import { createFlowerPokerStore } from "../src/services/flowerPokerStore.js";

// Execute real SQLite using Node's bundled driver for dependency-free tests.
// Production continues using the existing better-sqlite3 connection.
function fixture() {
  const native = new DatabaseSync(":memory:");
  native.exec(`
    CREATE TABLE accounts (
      guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
      balance INTEGER NOT NULL DEFAULT 0 CHECK(balance >= 0),
      last_daily_at INTEGER NOT NULL DEFAULT 0,
      last_work_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    );
    CREATE TABLE bets (
      id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
      wager INTEGER NOT NULL CHECK(wager > 0),
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','settled'))
    );
  `);
  const db = {
    prepare: (sql) => native.prepare(sql),
    transaction: (fn) => ({ immediate: (...args) => {
      native.exec("BEGIN IMMEDIATE");
      try { const result = fn(...args); native.exec("COMMIT"); return result; }
      catch (error) { native.exec("ROLLBACK"); throw error; }
    } }),
  };
  const add = (id, amount, guild = "g") => native.prepare("INSERT INTO accounts(guild_id,user_id,balance) VALUES(?,?,?)").run(guild,id,amount);
  const balance = (id, guild = "g") => native.prepare("SELECT balance FROM accounts WHERE guild_id=? AND user_id=?").get(guild,id).balance;
  return { native, ...createFlowerPokerStore(db), add, balance };
}

test("normalized odds and every weighted interval", () => {
  assert.ok(Math.abs(flowerProbabilities.reduce((s,x) => s+x.probability,0)-1) < 1e-12);
  let lower = 0;
  for (const item of flowerProbabilities) {
    assert.equal(drawFlower(() => lower + item.probability/2), item.id);
    lower += item.probability;
  }
  assert.equal(drawFlower(() => 0), "mixed");
  assert.equal(drawFlower(() => 1-Number.EPSILON), "white");
});

test("all 59,049 possible ordered hands have the expected rank counts", () => {
  const totals = Array(7).fill(0);
  const visit = (hand) => {
    if (hand.length === 5) { totals[rankHand(hand).rank]++; return; }
    for (const flower of flowers) visit([...hand,flower.id]);
  };
  visit([]);
  assert.deepEqual(totals,[15120,30240,7560,5040,720,360,9]);
});

test("same pattern ties regardless of flower rarity; full house beats trips", () => {
  assert.equal(compareHands(["white","white","red","blue","yellow"], ["red","red","purple","mixed","orange"]),0);
  assert.equal(compareHands(["red","red","red","blue","blue"], ["white","white","white","red","blue"]),1);
});

test("winner receives both stakes; repeat settlement cannot pay twice", () => {
  const f=fixture(); f.add("a",500); f.add("b",500); f.add("a",777,"other");
  const match=f.reserveMatch("g","a","b",100,"m1");
  assert.deepEqual([f.balance("a"),f.balance("b")],[400,400]);
  assert.deepEqual(f.settleMatch(match,0).balances,[600,400]);
  assert.equal(f.settleMatch(match,0),null);
  assert.equal(f.balance("a"),600); assert.equal(f.balance("a","other"),777);
  assert.throws(()=>f.reserveMatch("g","a","b",100,"m1"),/already processed/);
  f.native.close();
});

test("tie and timeout refund both players; either player can win", () => {
  for(const winner of [null,1]) {
    const f=fixture(); f.add("a",100); f.add("b",100);
    const match=f.reserveMatch("g","a","b",100,"m");
    f.settleMatch(match,winner);
    assert.deepEqual([f.balance("a"),f.balance("b")],winner===null?[100,100]:[0,200]);
    f.native.close();
  }
});

test("insufficient opponent balance makes no partial deduction", () => {
  const f=fixture(); f.add("a",100); f.add("b",5);
  assert.throws(()=>f.reserveMatch("g","a","b",20,"m"),/enough/);
  assert.deepEqual([f.balance("a"),f.balance("b")],[100,5]);
  assert.equal(f.native.prepare("SELECT COUNT(*) AS n FROM bets").get().n,0);
  f.native.close();
});

test("active blackjack/dice or flower wager prevents another reservation", () => {
  const f=fixture(); f.add("a",500); f.add("b",500); f.add("c",500);
  f.native.prepare("INSERT INTO bets(id,guild_id,user_id,wager) VALUES('dice','g','a',1)").run();
  assert.throws(()=>f.reserveMatch("g","a","b",20,"m"),/active bet/);
  f.native.prepare("UPDATE bets SET status='settled'").run();
  f.reserveMatch("g","a","b",20,"m");
  assert.throws(()=>f.reserveMatch("g","a","c",20,"other"),/active bet/);
  f.native.close();
});

test("invalid/self wagers cannot change balances", () => {
  const f=fixture(); f.add("a",100); f.add("b",100);
  for(const amount of [0,-1,1.5,NaN,Infinity,1_000_001]) {
    assert.throws(()=>f.reserveMatch("g","a","b",amount,"bad"));
  }
  assert.throws(()=>f.reserveMatch("g","a","a",1,"self"));
  assert.equal(f.balance("a"),100); f.native.close();
});

test("failure during payout rolls back both payouts and settlement markers", () => {
  const f=fixture(); f.add("a",100); f.add("b",100);
  const match=f.reserveMatch("g","a","b",10,"m");
  f.native.exec(`CREATE TRIGGER fail_second BEFORE UPDATE ON accounts WHEN NEW.user_id='b'
    BEGIN SELECT RAISE(ABORT,'forced failure'); END;`);
  assert.throws(()=>f.settleMatch(match,null),/forced failure/);
  assert.deepEqual([f.balance("a"),f.balance("b")],[90,90]);
  assert.equal(f.native.prepare("SELECT COUNT(*) AS n FROM bets WHERE status='open'").get().n,2);
  f.native.exec("DROP TRIGGER fail_second"); f.settleMatch(match,null); f.native.close();
});

test("existing startup refund and wipe logic see both flower wagers", () => {
  const f=fixture(); f.add("a",100); f.add("b",100);
  f.reserveMatch("g","a","b",10,"restart");
  const open=f.native.prepare("SELECT * FROM bets WHERE status='open'").all();
  assert.equal(open.length,2);
  // Same accounting as initializeBetting's per-open-bet refund.
  for(const bet of open) {
    f.native.prepare("UPDATE accounts SET balance=balance+? WHERE guild_id=? AND user_id=?")
      .run(bet.wager,bet.guild_id,bet.user_id);
    f.native.prepare("UPDATE bets SET status='settled' WHERE id=?").run(bet.id);
  }
  assert.deepEqual([f.balance("a"),f.balance("b")],[100,100]);
  f.native.close();
});
