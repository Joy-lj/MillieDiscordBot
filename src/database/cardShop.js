import db from "./connection.js";
import { createCardShopStore } from "../../services/cardShopStore.js";

export const cardShop = createCardShopStore(db);
export const initializeCardShop = () => cardShop.initialize();
