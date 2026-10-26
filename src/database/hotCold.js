import db from "./connection.js";
import { createHotColdStore } from "../../services/hotColdStore.js";

export const playHotCold = createHotColdStore(db);
