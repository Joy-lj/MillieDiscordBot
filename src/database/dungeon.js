import db from "./connection.js";
import { ITEMS } from "../config/items.js";
import { dungeonConfig } from "../config/dungeon.js";
import { createDungeonStore } from "../../services/dungeonStore.js";

export const dungeon = createDungeonStore(db, ITEMS, dungeonConfig);
