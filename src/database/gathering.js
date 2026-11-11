import db from "./connection.js";
import { ITEMS } from "../config/items.js";
import { createGatheringStore } from "../../services/gatheringStore.js";

export const gathering = createGatheringStore(db, ITEMS);
