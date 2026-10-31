import { randomInt } from "node:crypto";
import { DungeonError } from "./dungeonLogic.js";
const fail = (message) => { throw new DungeonError(message); };

export function snapshotLootTable(table, items) {
  if (!Array.isArray(table) || !table.length) fail("Dungeon loot table is empty.");
  const seen = new Set();
  const snapshot = table.map(({ itemId, weight }) => {
    if (seen.has(itemId)) fail("Duplicate dungeon loot entry.");
    seen.add(itemId);
    if (!Number.isSafeInteger(weight) || weight < 1) fail("Invalid dungeon loot weight.");
    if (itemId !== null && (typeof itemId !== "string" || !Object.hasOwn(items, itemId) ||
        !["weapon", "armor"].includes(items[itemId].type))) fail(`Unknown dungeon loot item: ${itemId}`);
    return { itemId, weight, name: itemId === null ? null : items[itemId].name };
  });
  const total = snapshot.reduce((n, entry) => n + entry.weight, 0);
  if (!Number.isSafeInteger(total) || total > 1_000_000_000) fail("Invalid total dungeon loot weight.");
  return snapshot;
}

export function rollDungeonLoot(table, rng = randomInt) {
  if (table == null) return []; // Runs entered before this update have currency only.
  if (!Array.isArray(table) || !table.length) fail("Invalid saved dungeon loot table.");
  const total = table.reduce((n, entry) => n + entry.weight, 0);
  if (!Number.isSafeInteger(total) || total < 1 || total > 1_000_000_000 ||
      table.some(entry => !Number.isSafeInteger(entry.weight) || entry.weight < 1 ||
        (entry.itemId !== null && (typeof entry.itemId !== "string" || !entry.itemId || typeof entry.name !== "string")))) {
    fail("Invalid saved dungeon loot table.");
  }
  let roll = rng(total);
  if (!Number.isInteger(roll) || roll < 0 || roll >= total) fail("Invalid loot random draw.");
  for (const entry of table) {
    if (roll < entry.weight) return entry.itemId === null ? [] : [{ itemId: entry.itemId, name: entry.name, quantity: 1 }];
    roll -= entry.weight;
  }
  fail("Invalid loot random draw.");
}

export function decodeLoot(value) {
  const loot = typeof value === "string" ? JSON.parse(value) : value ?? [];
  if (!Array.isArray(loot) || loot.length > 10 || loot.some(item => !item ||
    typeof item.itemId !== "string" || !item.itemId || typeof item.name !== "string" ||
    !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 10)) fail("Invalid saved dungeon loot.");
  return loot;
}

// Caller holds the owner's account row lock for the entire claim transaction.
// Buying/selling also uses that lock, keeping personal serial allocation safe.
export async function grantDungeonLoot(client, guild, user, loot, items) {
  const receipts = [];
  for (const drop of decodeLoot(loot)) {
    if (!Object.hasOwn(items, drop.itemId)) fail(`Restore item ${drop.itemId} to the config before claiming this saved drop.`);
    const { rows } = await client.query(
      `SELECT serial_number FROM public.user_items
       WHERE guild_id = $1 AND user_id = $2 AND item_id = $3 ORDER BY serial_number ASC`,
      [guild, user, drop.itemId]
    );
    const used = new Set(rows.map(row => Number(row.serial_number)));
    if ([...used].some(n => !Number.isSafeInteger(n) || n < 1)) fail("Invalid inventory serial number.");
    let next = 1;
    for (let i = 0; i < drop.quantity; i += 1) {
      while (used.has(next)) next += 1;
      if (!Number.isSafeInteger(next)) fail("Item serial limit reached.");
      const { rows: inserted } = await client.query(
        `INSERT INTO public.user_items (guild_id, user_id, item_id, serial_number)
         VALUES ($1, $2, $3, $4) RETURNING id, serial_number`, [guild, user, drop.itemId, next]
      );
      const instance = inserted[0];
      if (!instance || !Number.isSafeInteger(Number(instance.id)) || Number(instance.id) < 1 ||
          Number(instance.serial_number) !== next) fail("Could not confirm the dungeon item grant.");
      receipts.push({ itemId: drop.itemId, name: drop.name, instanceId: Number(instance.id), serialNumber: next });
      used.add(next);
    }
  }
  return receipts;
}
