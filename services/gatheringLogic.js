import { randomInt } from "node:crypto";

export class GatheringError extends Error {}
const fail = message => { throw new GatheringError(message); };

export function activityFor(config, items, activity) {
  if (!Object.hasOwn(config.activities ?? {}, activity)) fail("Unknown activity. Use !mine, !scavenge or !hunt.");
  const entry = config.activities[activity];
  if (!entry || typeof entry.name !== "string" || !entry.name || typeof entry.emoji !== "string" ||
      !Number.isSafeInteger(entry.cooldownMs) || entry.cooldownMs < 1000 || entry.cooldownMs > 30 * 86400_000 ||
      !Array.isArray(entry.basic) || !entry.basic.length || entry.basic.length > 10 ||
      !Array.isArray(entry.rare) || entry.rare.length > 10) fail("Invalid gathering configuration.");
  const knownMaterial = id => typeof id === "string" && Object.hasOwn(items, id) && items[id]?.type === "material";
  const unique = rows => new Set(rows.map(row => row.itemId)).size === rows.length;
  if (!unique(entry.basic) || !unique(entry.rare)) fail("Duplicate gathering material.");
  for (const row of entry.basic) {
    if (!knownMaterial(row.itemId) || !Number.isSafeInteger(row.weight) || row.weight < 1 ||
        !Number.isSafeInteger(row.min) || !Number.isSafeInteger(row.max) || row.min < 1 || row.max < row.min || row.max > 10) {
      fail("Invalid basic material drop. Materials must exist in your crafting catalog.");
    }
  }
  for (const row of entry.rare) {
    if (!knownMaterial(row.itemId) || !Number.isSafeInteger(row.bps) || row.bps < 1) fail("Invalid rare component drop.");
  }
  if (entry.basic.reduce((n, row) => n + row.weight, 0) !== 10_000 ||
      entry.rare.reduce((n, row) => n + row.bps, 0) > 10_000) fail("Basic weights must total 10,000; rare basis points must total at most 10,000.");
  return entry;
}

function draw(max, rng) {
  const n = rng(max);
  if (!Number.isSafeInteger(n) || n < 0 || n >= max) fail("Invalid gathering random draw.");
  return n;
}

function pick(rows, key, rng) {
  let roll = draw(10_000, rng);
  for (const row of rows) {
    if (roll < row[key]) return row;
    roll -= row[key];
  }
  return null;
}

export function rollGathering(config, items, activity, rng = randomInt) {
  const entry = activityFor(config, items, activity);
  const basic = pick(entry.basic, "weight", rng);
  const quantity = basic.min + draw(basic.max - basic.min + 1, rng);
  const rare = pick(entry.rare, "bps", rng);
  const drops = [{ itemId: basic.itemId, name: items[basic.itemId].name, quantity, bonus: false }];
  if (rare) drops.push({ itemId: rare.itemId, name: items[rare.itemId].name, quantity: 1, bonus: true });
  return drops;
}
