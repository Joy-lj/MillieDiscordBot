import { writeFile } from "node:fs/promises";
import { fetchCard } from "../services/tcgdex.js";
import { renderCard } from "../src/cards/renderCard.js";

const id=process.argv[2]??"swsh3-136";
const card=await fetchCard(id);
const png=await renderCard(card,"preview");
await writeFile("card-preview.png",png);
console.log(`Rendered ${card.name} (${card.rarity}) to card-preview.png`);
