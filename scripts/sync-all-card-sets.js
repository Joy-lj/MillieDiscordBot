import { mkdir, rename, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import db, { initializeDatabase } from "../src/database/connection.js";
import { createCardShopStore } from "../services/cardShopStore.js";
import { fetchSetCards } from "../services/tcgdex.js";
import { rarityGroup } from "../src/config/cardShop.js";
import { buildManifest, validateSets } from "../services/cardSetPacks.js";

const argumentsList = process.argv.slice(2);
const refresh = argumentsList.includes("--refresh");
const limitArg = argumentsList.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice(8)) : Infinity;
if (limitArg && (!Number.isSafeInteger(limit) || limit < 1)) {
  throw new Error("Use --limit=5 (a positive whole number).");
}
const manifestPath = new URL("../data/cardshop-set-manifest.json", import.meta.url);

async function retry(fn, label) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await fn(); }
    catch (error) {
      lastError = error;
      // Retry transient API/network failures; incomplete card metadata is left
      // for the next sync instead of being silently skipped.
      if (!/HTTP (429|500|502|503|504)|fetch failed|timeout|aborted/i.test(error.message ?? "")) throw error;
      if (attempt < 2) {
        const waitMs = (attempt + 1) * 5000;
        console.warn(`${label}: ${error.message}. Retry ${attempt + 1}/2 in ${waitMs / 1000}s.`);
        await delay(waitMs);
      }
    }
  }
  throw lastError;
}

async function fetchSets() {
  return retry(async () => {
    const response = await fetch("https://api.tcgdex.net/v2/en/sets", {
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`TCGdex returned HTTP ${response.status} for sets`);
    return validateSets(await response.json());
  }, "Set list");
}

async function saveManifest(sets, groupsBySet) {
  const data = buildManifest(sets, groupsBySet);
  await mkdir(new URL("../data/", import.meta.url), { recursive: true });
  const temporary = new URL(`../data/cardshop-set-manifest.${process.pid}.tmp`, import.meta.url);
  await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`);
  await rename(temporary, manifestPath);
}

try {
  await initializeDatabase();
  // No pack definitions needed to import catalog rows. This instance is local
  // to the standalone script, not a second bot startup.
  const store = createCardShopStore(db, []);
  await store.initialize();

  const sets = await fetchSets();
  console.log(`Found ${sets.length} English-language TCGdex sets.`);

  const { rows } = await db.query(
    `SELECT set_id, bucket FROM public.card_catalog
     WHERE active = 1 GROUP BY set_id, bucket ORDER BY set_id, bucket`
  );
  const groupsBySet = new Map();
  for (const row of rows) {
    if (!groupsBySet.has(row.set_id)) groupsBySet.set(row.set_id, []);
    groupsBySet.get(row.set_id).push(row.bucket);
  }
  await saveManifest(sets, groupsBySet);

  let imported = 0;
  let skipped = 0;
  let attempted = 0;
  let failed = 0;
  for (const set of sets) {
    if (!refresh && groupsBySet.has(set.id)) {
      skipped += 1;
      continue;
    }
    if (attempted >= limit) break;
    attempted += 1;
    try {
      console.log(`Fetching ${set.id}: ${set.name}...`);
      const cards = await retry(() => fetchSetCards(set.id, (done, total) => {
        if (done % 25 === 0 || done === total) console.log(`${set.id}: ${done}/${total}`);
      }), set.id);
      const count = await store.importSet(set.id, cards);
      groupsBySet.set(set.id, [...new Set(cards.map((card) => rarityGroup(card.rarity)))].sort());
      // Save after each import so interruptions do not lose all progress.
      await saveManifest(sets, groupsBySet);
      imported += 1;
      console.log(`✅ Imported ${count} cards for ${set.name}.`);
    } catch (error) {
      failed += 1;
      console.error(`❌ ${set.id} not updated: ${error.message}`);
      process.exitCode = 1;
    }
    await delay(1000);
  }
  const missing = sets.filter((set) => !groupsBySet.has(set.id)).length;
  console.log(`Done: ${imported} imported, ${skipped} already imported, ${failed} failed, ${missing} sets still missing.`);
  console.log("Restart the bot and run !cardshop again to load the generated packs.");
  if (missing) console.log("Rerun this script to resume; successful imports are skipped unless --refresh is used.");
} catch (error) {
  console.error("All-set sync failed:", error);
  process.exitCode = 1;
} finally {
  await db.end();
}
