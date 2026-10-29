import db from "./connection.js";
import { createFishingStore } from "../../services/fishingStore.js";

export const fishing=createFishingStore(db);
export const initializeFishing=()=>fishing.initialize();
