import { readFile, writeFile, access } from "node:fs/promises";

// Preserve your actual item catalog and gear drop weights. Only wrap their exports.
const tasks = [
  { path: new URL("../src/config/items.js", import.meta.url), name: "ITEMS", helper: "withCraftingItems", marker: "MILLIE_CRAFTING_CATALOG_V1" },
  { path: new URL("../src/config/dungeonLoot.js", import.meta.url), name: "dungeonLootTables", helper: "withMaterialDrops", marker: "MILLIE_MATERIAL_DROPS_V1" },
];

try {
  const changes = [];
  for (const task of tasks) {
    const original = await readFile(task.path, "utf8");
    if (original.includes(task.marker)) { console.log(`${task.name}: already integrated.`); continue; }
    const declaration = new RegExp(`export\\s+const\\s+${task.name}\\s*=`, "g");
    if ((original.match(declaration) ?? []).length !== 1 || original.includes(task.helper)) {
      throw new Error(`${task.name}: expected one plain exported const. No configs changed. See SETUP.txt for manual integration.`);
    }
    const updated = `import { ${task.helper} } from "./crafting.js";\n` +
      original +
      `\n// ${task.marker}\nObject.assign(${task.name}, ${task.helper}(${task.name}));\n`;
    changes.push({ ...task, original, updated });
  }
  // Both files must pass preflight before either is changed.
  for (const task of changes) {
    const backup = new URL(task.path.href + ".before-crafting");
    try { await access(backup); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      await writeFile(backup, task.original, { flag: "wx" });
    }
  }
  const written = [];
  try {
    for (const task of changes) {
      written.push(task);
      await writeFile(task.path, task.updated);
      console.log(`${task.name}: integrated; original backed up.`);
    }
  } catch (error) {
    for (const task of written) await writeFile(task.path, task.original);
    throw error;
  }
} catch (error) {
  console.error("Crafting config integration stopped:", error.message);
  process.exitCode = 1;
}
