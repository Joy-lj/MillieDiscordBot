import db, {
  initializeDatabase,
} from "../src/database/connection.js";

import {
  cardShop,
  initializeCardShop,
} from "../src/database/cardShop.js";

import { packDefinitions } from "../src/config/cardShop.js";
import { fetchSetCards } from "../services/tcgdex.js";

try {
  await initializeDatabase();
  await initializeCardShop();

  const setIds = new Set(
    packDefinitions.flatMap((pack) => pack.setIds)
  );

  for (const setId of setIds) {
    try {
      console.log(`Fetching ${setId}...`);

      const cards = await fetchSetCards(
        setId,
        (done, total) => {
          if (done % 10 === 0 || done === total) {
            console.log(`${setId}: ${done}/${total}`);
          }
        }
      );

      const imported = await cardShop.importSet(setId, cards);

      console.log(`Imported ${imported} cards for ${setId}.`);
    } catch (error) {
      console.error(
        `Set ${setId} not updated:`,
        error.message
      );

      process.exitCode = 1;
    }
  }

  const offers = await cardShop.offers();

  for (const offer of offers) {
    if (offer.ready) {
      console.log(`✅ ${offer.name}: ready`, offer.poolSizes);
    } else {
      console.error(`❌ ${offer.name}: ${offer.reason}`);
      process.exitCode = 1;
    }
  }
} catch (error) {
  console.error("Catalog sync failed:", error);
  process.exitCode = 1;
} finally {
  // Close connections when this standalone script finishes.
  await db.end();
}