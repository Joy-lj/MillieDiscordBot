import { readFile, writeFile, copyFile, access } from "node:fs/promises";
import { constants } from "node:fs";

// Run at your project root: node scripts/patch-dungeon-equipment.mjs
const storePath = new URL("../services/dungeonStore.js", import.meta.url);
const logicPath = new URL("../services/dungeonLogic.js", import.meta.url);
const helperPath = new URL("../services/dungeonEquipment.js", import.meta.url);
const once = (source, before, after, label) => {
  if (source.split(before).length !== 2) {
    throw new Error(`Cannot locate ${label} exactly once. No dungeon service files were changed. Send your current dungeonStore.js and dungeonLogic.js for a tailored update.`);
  }
  return source.replace(before, after);
};

try {
  await access(helperPath);
  const [store, logic] = (await Promise.all([readFile(storePath, "utf8"), readFile(logicPath, "utf8")])).map(source => source.replace(/\r\n/g, "\n"));
  const doneStore = store.includes("equipment: await loadDungeonEquipment(client, guild, user, items)");
  const doneLogic = logic.includes("return makeLoadoutPlayer(userId, loadout, config, combat)");
  if (doneStore && doneLogic) {
    console.log("Dungeon equipment slot update is already installed.");
  } else {
    if (doneStore || doneLogic) throw new Error("Partial equipment update found. No files changed; send both current dungeon service files for review.");
    let nextStore = once(store, 'import { createHash, randomInt, randomUUID } from "node:crypto";',
      'import { createHash, randomInt, randomUUID } from "node:crypto";\nimport { loadDungeonEquipment } from "./dungeonEquipment.js";', "dungeon store imports");
    nextStore = once(nextStore, "accounts.set(user, rows[0]);",
      "accounts.set(user, { ...rows[0], equipment: await loadDungeonEquipment(client, guild, user, items) });", "locked account loader");
    let calls = 0;
    nextStore = nextStore.replace(/makePlayer\((leader|player), account\.weapon_item_id, account\.armor_item_id, items, ([^)\n]+)\)/g,
      (_, player, config) => { calls++; return `makePlayer(${player}, account.weapon_item_id, account.armor_item_id, items, ${config}, account.equipment)`; });
    if (calls !== 2) throw new Error(`Expected two dungeon player creation calls; found ${calls}. No files changed. Send your current dungeonStore.js.`);
    let nextLogic = once(logic, 'import { randomInt } from "node:crypto";',
      'import { randomInt } from "node:crypto";\nimport { makeLoadoutPlayer } from "./dungeonEquipment.js";', "dungeon logic imports");
    nextLogic = once(nextLogic,
      'export function makePlayer(userId, weaponId, armorId, items, config) {\n  const combat = resolveCombatConfig(config.combat ?? {});',
      'export function makePlayer(userId, weaponId, armorId, items, config, loadout = null) {\n  const combat = resolveCombatConfig(config.combat ?? {});\n  if (loadout !== null) return makeLoadoutPlayer(userId, loadout, config, combat);',
      "configurable dungeon player builder");
    // All expected source locations were validated before any service is written.
    for (const [path, updated] of [[storePath, nextStore], [logicPath, nextLogic]]) {
      try { await copyFile(path, new URL(path.href + ".before-equipment-slots.bak"), constants.COPYFILE_EXCL); }
      catch (error) { if (error.code !== "EEXIST") throw error; }
      await writeFile(path, updated);
    }
    console.log("Updated dungeonStore.js and dungeonLogic.js. Restart the bot; new runs will capture all equipment slots.");
  }
} catch (error) {
  console.error("Dungeon equipment patch stopped:", error.message);
  process.exitCode = 1;
}
