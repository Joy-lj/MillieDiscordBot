import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { findGroup, selectBooster, usdToCurrency } from "../services/cardPackPricing.js";
import { GROUP_OVERRIDES, PRODUCT_OVERRIDES, USD_OVERRIDES } from "../src/config/cardPackPricing.js";

const cachePath = new URL("../data/cardshop-market-prices.json", import.meta.url);
const manifestPath = new URL("../data/cardshop-set-manifest.json", import.meta.url);
const USER_AGENT = "MillieDiscordBot/1.0 (sealed-pack pricing sync)";

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; return fallback; }
}

async function fetchResults(path) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      // Sequential requests, spaced to stay comfortably below four per second.
      await delay(350);
      const response = await fetch(`https://tcgcsv.com/tcgplayer/3/${path}`, {
        headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`TCGCSV HTTP ${response.status} for ${path}`);
      const data = await response.json();
      if (data.success !== true || !Array.isArray(data.results)) throw new Error(`Invalid TCGCSV response for ${path}`);
      return data.results;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await delay((attempt + 1) * 3000);
    }
  }
  throw lastError;
}

async function saveCache(data) {
  await mkdir(new URL("../data/", import.meta.url), { recursive: true });
  const temporary = new URL(`../data/cardshop-market-prices.${process.pid}.tmp`, import.meta.url);
  await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`);
  await rename(temporary, cachePath);
}

try {
  const manifest = await readJson(manifestPath, null);
  if (!manifest || !Array.isArray(manifest.sets) || !manifest.sets.length) {
    throw new Error("Run scripts/sync-all-card-sets.js first to create the English set manifest.");
  }
  const data = await readJson(cachePath, { schemaVersion: 1, sets: {} });
  if (data.schemaVersion !== 1 || !data.sets || typeof data.sets !== "object" || Array.isArray(data.sets)) {
    throw new Error("Invalid existing price cache; it was not overwritten.");
  }
  const groups = await fetchResults("groups");
  const productsByGroup = new Map();
  const pricesByGroup = new Map();
  const unresolved = [];
  let updated = 0;

  for (const set of manifest.sets) {
    if (USD_OVERRIDES[set.id] !== undefined) {
      console.log(`Manual ${set.name}: $${USD_OVERRIDES[set.id]} -> ${usdToCurrency(USD_OVERRIDES[set.id])}`);
      continue;
    }
    const group = findGroup(set, groups, GROUP_OVERRIDES[set.id]);
    if (!group) {
      unresolved.push({ setId: set.id, setName: set.name, reason: "No unique set-name match. Set GROUP_OVERRIDES or USD_OVERRIDES." });
      continue;
    }
    try {
      if (!productsByGroup.has(group.groupId)) productsByGroup.set(group.groupId, await fetchResults(`${group.groupId}/products`));
      if (!pricesByGroup.has(group.groupId)) pricesByGroup.set(group.groupId, await fetchResults(`${group.groupId}/prices`));
      const found = selectBooster(productsByGroup.get(group.groupId), pricesByGroup.get(group.groupId), PRODUCT_OVERRIDES[set.id]);
      if (!found) {
        unresolved.push({
          setId: set.id, setName: set.name, groupId: group.groupId,
          reason: "No unique ordinary loose booster with one positive market price. Set PRODUCT_OVERRIDES or USD_OVERRIDES.",
          candidates: productsByGroup.get(group.groupId).filter((product) => /booster pack/i.test(product.name ?? ""))
            .map((product) => ({ productId: product.productId, name: product.name, url: product.url })),
        });
        continue;
      }
      const price = usdToCurrency(found.usd);
      data.sets[set.id] = {
        usd: found.usd, productId: found.product.productId, productName: found.product.name,
        groupId: group.groupId, groupName: group.name,
        source: found.product.url ?? `https://www.tcgplayer.com/product/${found.product.productId}`,
        feed: "TCGCSV mirror of TCGplayer marketPrice",
        retrievedAt: new Date().toISOString(),
      };
      await saveCache(data);
      updated += 1;
      console.log(`✅ ${set.name}: $${found.usd.toFixed(2)} -> ${price} currency`);
    } catch (error) {
      console.error(`Could not update ${set.name}: ${error.message}. Previous price retained.`);
      unresolved.push({ setId: set.id, setName: set.name, reason: error.message });
      process.exitCode = 1;
    }
  }

  await mkdir(new URL("../data/", import.meta.url), { recursive: true });
  await writeFile(new URL("../data/cardshop-unpriced-sets.json", import.meta.url), `${JSON.stringify(unresolved, null, 2)}\n`);
  console.log(`Finished: ${updated} prices updated; ${unresolved.length} sets need review. Previous prices remain for failed/unmatched sets.`);
  console.log("See data/cardshop-unpriced-sets.json. Restart the bot, then run !cardshop again.");
} catch (error) {
  console.error("Pack price sync failed:", error);
  process.exitCode = 1;
}
