import { applyItemUpgrade, reinforcementCost, upgradeLevel } from "../../services/itemUpgrades.js";
import { createHash } from "node:crypto";
import db from "./connection.js";
import { ITEMS } from "../config/items.js";
import { craftingConfig } from "../config/crafting.js";

export class CraftingError extends Error {}
export const MAX_CRAFT_BATCH = 10;
const fail = message => { throw new CraftingError(message); };
const integer = value => {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) fail("An inventory value exceeds the supported limit.");
  return n;
};
const itemFor = id => Object.hasOwn(ITEMS, id) ? ITEMS[id] : null;

function selectionFor(selection) {
  if (!selection || !["craft", "salvage", "upgrade"].includes(selection.kind) ||
    typeof selection.itemId !== "string" || !/^[a-z0-9_-]+$/.test(selection.itemId)) fail("Invalid crafting selection.");
  const serial = selection.serialNumber == null ? null : integer(selection.serialNumber);
  if (serial === 0 || (["salvage", "upgrade"].includes(selection.kind) && serial == null)) fail("Provide a positive item serial number.");
  const quantity = selection.quantity ?? 1;
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_CRAFT_BATCH || (selection.kind !== "craft" && quantity !== 1)) fail("Use 1–10 supplies per craft; gear actions are one copy at a time.");
  return { kind: selection.kind, itemId: selection.itemId, serialNumber: serial, quantity };
}

async function transaction(guild, user, fn) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT balance, equipped_weapon_id, equipped_armor_id FROM public.accounts
       WHERE guild_id = $1 AND user_id = $2 FOR UPDATE`, [guild, user]
    );
    if (!rows[0]) fail("You need an economy account. Use !balance first.");
    const result = await fn(client, rows[0]);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); }
    catch (rollbackError) { console.error("Crafting rollback failed:", rollbackError); }
    throw error;
  } finally { client.release(); }
}

async function inventory(client, guild, user, account) {
  const { rows } = await client.query(
    `SELECT id, item_id, serial_number, is_locked, upgrade_level FROM public.user_items
     WHERE guild_id = $1 AND user_id = $2 ORDER BY item_id, serial_number FOR UPDATE`, [guild, user]
  );
  const equipped = await client.query(
    `SELECT item_instance_id FROM public.user_equipment WHERE guild_id = $1 AND user_id = $2`, [guild, user]
  );
  const protectedIds = new Set(equipped.rows.map(row => String(row.item_instance_id)));
  for (const id of [account.equipped_weapon_id, account.equipped_armor_id]) if (id != null) protectedIds.add(String(id));
  return { rows: rows.map(row => ({ ...row, id: integer(row.id), serial_number: integer(row.serial_number), upgrade_level: upgradeLevel(row.upgrade_level ?? 0) })), protectedIds };
}

function planFor(guild, user, selection, owned) {
  const { kind, itemId, serialNumber, quantity: batch } = selection;
  const consumed = [], outputs = [], requirements = [], blockers = [];
  const protectedCopy = row => row.is_locked || owned.protectedIds.has(String(row.id));
  let fee = 0, name, upgrade = null;
  if (kind === "craft" || kind === "upgrade") {
    let recipe;
    if (kind === "upgrade") {
      const item = itemFor(itemId);
      const copy = owned.rows.find(row => row.item_id === itemId && row.serial_number === serialNumber);
      if (!item || !["weapon", "armor"].includes(item.type)) fail("Only weapons and armor can be reinforced.");
      if (!copy) fail("You don't own that item and serial number.");
      if (protectedCopy(copy)) blockers.push("Unequip and unlock that copy before upgrading it.");
      const next = copy.upgrade_level + 1;
      if (next > craftingConfig.reinforcement.maxLevel) fail("That item is already at the maximum reinforcement level.");
      const costs = reinforcementCost(item, next);
      const before = applyItemUpgrade(item, copy.upgrade_level), after = applyItemUpgrade(item, next);
      const key = item.type === "weapon" ? "attack" : "defense";
      if (!(after.stats[key] > before.stats[key])) fail("This item has no reinforceable combat stat.");
      upgrade = { id: copy.id, itemId, serialNumber, from: copy.upgrade_level, to: next, key, before: before.stats[key], after: after.stats[key], healthBefore: before.stats?.health ?? 0, healthAfter: after.stats?.health ?? 0 };
      recipe = { ...costs, name: after.name };
      name = after.name;
    } else {
      recipe = Object.hasOwn(craftingConfig.recipes, itemId) ? craftingConfig.recipes[itemId] : null;
      if (!recipe) fail("Unknown recipe. Use !craft to see recipes.");
      if (batch > 1 && (recipe.baseItemId || itemFor(recipe.outputItemId)?.type !== "consumable")) fail("Only supplies can be crafted in batches.");
    }
    if (!Array.isArray(recipe.ingredients) || !recipe.ingredients.length || recipe.ingredients.length > 10) fail("Invalid recipe ingredients.");
    fee = integer(integer(recipe.fee ?? 0) * batch);
    const seen = new Set();
    for (const ingredient of recipe.ingredients) {
      const item = itemFor(ingredient.itemId);
      if (!item || seen.has(ingredient.itemId) || !Number.isSafeInteger(ingredient.quantity) || ingredient.quantity < 1 || ingredient.quantity > 1000) fail("Invalid recipe ingredient.");
      seen.add(ingredient.itemId);
      const required = integer(ingredient.quantity * batch);
      const eligible = owned.rows.filter(row => row.item_id === ingredient.itemId && !protectedCopy(row) &&
        (kind === "upgrade" || serialNumber == null || ingredient.itemId !== recipe.baseItemId || row.serial_number === serialNumber))
        .sort((a, b) => a.upgrade_level - b.upgrade_level || a.serial_number - b.serial_number);
      requirements.push({ itemId: ingredient.itemId, name: item.name, required, available: eligible.length, missing: Math.max(0, required - eligible.length) });
      consumed.push(...eligible.slice(0, required));
    }
    if (kind === "craft") {
      if (serialNumber != null && !seen.has(recipe.baseItemId)) fail("This recipe has no selectable base item.");
      const output = itemFor(recipe.outputItemId);
      if (!output) fail("The recipe's output item is missing from ITEMS.");
      const base = consumed.find(row => row.item_id === recipe.baseItemId) ?? owned.rows.find(row => row.item_id === recipe.baseItemId && row.serial_number === serialNumber);
      const level = ["weapon", "armor"].includes(output.type) ? base?.upgrade_level ?? 0 : 0;
      name = applyItemUpgrade(output, level).name;
      outputs.push({ itemId: recipe.outputItemId, name, quantity: batch, upgradeLevel: level });
    }
  } else {
    const item = itemFor(itemId);
    if (!item || !["weapon", "armor", "accessory"].includes(item.type) || item.salvageable === false) fail("That item cannot be salvaged.");
    const copy = owned.rows.find(row => row.item_id === itemId && row.serial_number === serialNumber);
    if (!copy) fail("You don't own that item and serial number.");
    if (protectedCopy(copy)) blockers.push("Unequip and unlock that copy before salvaging it.");
    const quantity = craftingConfig.salvageByRarity[item.dungeon?.rarity ?? "common"];
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) fail("Missing or invalid salvage yield for this rarity.");
    const materialId = craftingConfig.salvageMaterialBySlot[item.slot] ?? craftingConfig.salvageMaterialByType[item.type];
    const material = itemFor(materialId);
    if (!material || material.type !== "material") fail("Salvage material is missing from ITEMS.");
    consumed.push(copy);name = applyItemUpgrade(item, copy.upgrade_level).name;
    outputs.push({ itemId: materialId, name: material.name, quantity, upgradeLevel: 0 });
  }
  if (consumed.length > 1000) fail("Too many ingredients for one action. Use a smaller batch.");
  const plan = { ...selection, name, fee, upgrade, requirements, blockers,
    consumed: consumed.map(row => ({ id: row.id, itemId: row.item_id, serialNumber: row.serial_number,
      upgradeLevel: row.upgrade_level, name: applyItemUpgrade(itemFor(row.item_id), row.upgrade_level)?.name ?? row.item_id })), outputs };
  // Extra materials arriving from gathering do not invalidate a reviewed craft.
  // The exact consumed copies, prices, outputs and target upgrade still must match.
  const signature = { ...plan, requirements: requirements.map(({ itemId, required }) => ({ itemId, required })) };
  plan.quote = createHash("sha256").update(JSON.stringify({ guild, user, plan: signature, definitions: [itemFor(itemId), ...outputs.map(output => itemFor(output.itemId))] })).digest("hex");
  return plan;
}

export async function previewCrafting(guild, user, selection) {
  selection = selectionFor(selection);
  return transaction(guild, user, async (client, account) => {
    const plan = planFor(guild, user, selection, await inventory(client, guild, user, account));
    const balance = integer(account.balance);
    return { ...plan, balance, ready: balance >= plan.fee && !plan.blockers.length && plan.requirements.every(row => row.missing === 0) };
  });
}

export async function confirmCrafting(guild, user, requestId, selection, quote) {
  selection = selectionFor(selection);
  if (typeof requestId !== "string" || !requestId || requestId.length > 100 || !/^[0-9a-f]{64}$/.test(quote ?? "")) fail("Invalid crafting confirmation.");
  const target = `${selection.itemId}:${selection.serialNumber ?? "-"}${selection.quantity > 1 ? `:q${selection.quantity}` : ""}`;
  return transaction(guild, user, async (client, account) => {
    const old = await client.query(
      `SELECT kind, target, result FROM public.crafting_actions WHERE guild_id = $1 AND user_id = $2 AND request_id = $3`, [guild, user, requestId]
    );
    if (old.rows[0]) {
      if (old.rows[0].kind !== selection.kind || old.rows[0].target !== target) fail("This request ID belongs to another action.");
      return typeof old.rows[0].result === "string" ? JSON.parse(old.rows[0].result) : old.rows[0].result;
    }
    const owned = await inventory(client, guild, user, account);
    const plan = planFor(guild, user, selection, owned);
    if (plan.blockers.length) fail(plan.blockers.join(" "));
    if (plan.requirements.some(row => row.missing > 0)) fail("Requirements are no longer met. Open a new preview to see every requirement; nothing was consumed.");
    if (plan.quote !== quote) fail("Your eligible items or recipe changed. Open a new preview; nothing was consumed.");
    if (integer(account.balance) < plan.fee) fail("You no longer have enough currency for the crafting fee.");
    if (plan.fee) {
      const paid = await client.query(
        `UPDATE public.accounts SET balance = balance - $1 WHERE guild_id = $2 AND user_id = $3 AND balance >= $1 RETURNING balance`, [plan.fee, guild, user]
      );
      if (!paid.rows[0]) fail("Could not charge the crafting fee.");
    }
    const ids = plan.consumed.map(row => row.id);
    const removed = await client.query(
      `DELETE FROM public.user_items WHERE guild_id = $1 AND user_id = $2 AND id = ANY($3::bigint[]) AND is_locked = FALSE RETURNING id`, [guild, user, ids]
    );
    if (removed.rows.length !== ids.length) fail("The selected items changed. The action was rolled back.");
    let updatedItem = null;
    if (plan.upgrade) {
      const change = plan.upgrade;
      const changed = await client.query(
        `UPDATE public.user_items SET upgrade_level = $1 WHERE guild_id = $2 AND user_id = $3 AND id = $4 AND upgrade_level = $5 AND is_locked = FALSE RETURNING id`,
        [change.to, guild, user, change.id, change.from]
      );
      if (changed.rows.length !== 1) fail("The target gear changed. Reinforcement was rolled back.");
      updatedItem = { ...change, name: plan.name };
    }
    const remaining = owned.rows.filter(row => !ids.includes(row.id));
    const addedItems = [];
    for (const output of plan.outputs) {
      const used = new Set(remaining.filter(row => row.item_id === output.itemId).map(row => row.serial_number));
      let next = 1;
      for (let i = 0; i < output.quantity; i++) {
        while (used.has(next)) next++;
        integer(next);
        if (next > 2_147_483_647) fail("Inventory serial limit reached.");
        const result = await client.query(
          `INSERT INTO public.user_items (guild_id, user_id, item_id, serial_number, upgrade_level) VALUES ($1, $2, $3, $4, $5) RETURNING id, serial_number`, [guild, user, output.itemId, next, output.upgradeLevel ?? 0]
        );
        if (!result.rows[0]) fail("Could not grant the resulting item.");
        addedItems.push({ itemId: output.itemId, name: output.name, id: integer(result.rows[0].id), serialNumber: integer(result.rows[0].serial_number), upgradeLevel: output.upgradeLevel ?? 0 });
        used.add(next);
      }
    }
    const receipt = { kind: plan.kind, consumed: plan.consumed, outputs: plan.outputs, addedItems, updatedItem, fee: plan.fee, balance: integer(account.balance) - plan.fee };
    await client.query(
      `INSERT INTO public.crafting_actions (guild_id, user_id, request_id, kind, target, result) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`, [guild, user, requestId, plan.kind, target, JSON.stringify(receipt)]
    );
    return receipt;
  });
}

// A consistent, account-locked snapshot for the browser. This never spends items.
export async function getCraftingInventory(guild, user) {
  return transaction(guild, user, async (client, account) => {
    const owned = await inventory(client, guild, user, account);
    return { balance: integer(account.balance), rows: owned.rows.map(row => ({
      ...row, is_equipped: owned.protectedIds.has(String(row.id)),
    })) };
  });
}
