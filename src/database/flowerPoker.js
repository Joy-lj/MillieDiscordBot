// import db from "./connection.js";
// import { createFlowerPokerStore } from "../../services/flowerPokerStore.js";

// export const { reserveMatch, settleMatch } = createFlowerPokerStore(db);

import db from "./connection.js";
import { createFlowerPokerStore } from "../../services/flowerPokerStore.js";

export const { reserveMatch, settleMatch } =
    createFlowerPokerStore(db);