import { readFile, writeFile } from "node:fs/promises";

const path = new URL("../src/config/dungeonLoot.js", import.meta.url);
const marker = "MILLIE_CRAFTING_STAGES_V1";
try {
  const original = await readFile(path, "utf8");
  if (original.includes(marker)) {
    console.log("Three-stage crafting drops already integrated.");
  } else {
    if (!/export\s+const\s+dungeonLootTables\s*=/.test(original)) throw new Error("Expected exported dungeonLootTables. No file changed.");
    const imported = /import\s*\{[^}]*\bwithMaterialDrops\b[^}]*\}\s*from\s*["']\.\/crafting\.js["']/.test(original);
    const updated = (imported ? "" : 'import { withMaterialDrops } from "./crafting.js";\n') + original +
      `\n// ${marker}: apply after every difficulty, including Ultra.\nObject.assign(dungeonLootTables, withMaterialDrops(dungeonLootTables));\n`;
    try { await writeFile(new URL(path.href + ".before-three-stages"), original, { flag: "wx" }); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
    await writeFile(path, updated);
    console.log("Crafting materials integrated; previous loot config backed up.");
  }
} catch (error) {
  console.error("Crafting stages installation stopped:", error.message);
  process.exitCode = 1;
}
