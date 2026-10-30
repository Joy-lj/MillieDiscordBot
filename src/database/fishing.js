// import db from "./connection.js";
// import { createFishingStore } from "../../services/fishingStore.js";

// export const fishing=createFishingStore(db);
// export const initializeFishing=()=>fishing.initialize();

import db from "./connection.js";
import { createFishingStore } from "../../services/fishingStore.js";

export const fishing = createFishingStore(db);

export async function initializeFishing() {
    await fishing.initialize();
}