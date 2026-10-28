import { initializeDatabase } from "../src/database/connection.js";
import { cardShop,initializeCardShop } from "../src/database/cardShop.js";
import { packDefinitions } from "../src/config/cardShop.js";
import { fetchSetCards } from "../services/tcgdex.js";

initializeDatabase();
initializeCardShop();
for(const setId of new Set(packDefinitions.flatMap((pack)=>pack.setIds))) {
  try {
    console.log(`Fetching ${setId}...`);
    const cards=await fetchSetCards(setId,(done,total)=>{
      if(done%10===0 || done===total)console.log(`${setId}: ${done}/${total}`);
    });
    console.log(`Imported ${cardShop.importSet(setId,cards)} cards for ${setId}.`);
  } catch(error) {
    console.error(`Set ${setId} not updated:`,error.message);
    process.exitCode=1;
  }
}
for(const offer of cardShop.offers()) console.log(offer.name,offer.ready?offer.poolSizes:offer.reason);
