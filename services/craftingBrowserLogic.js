export const CRAFT_CATEGORIES = {
  supplies: "Dungeon Supplies", attachments: "Rare Attachments", materials: "Raid Components",
  upgrade: "Reinforcement", salvage: "Salvaging",
};

export function recipeCategory(recipe, items) {
  return items[recipe.outputItemId]?.type === "material" ? "materials" : items[recipe.outputItemId]?.type === "consumable" ? "supplies" : "attachments";
}

export function browserEntries(category, recipes, items, rows) {
  if (["supplies", "attachments", "materials"].includes(category)) {
    return Object.entries(recipes).filter(([, recipe]) => recipeCategory(recipe, items) === category)
      .map(([id, recipe]) => ({ id, name: recipe.name, itemId: recipe.outputItemId, recipe }));
  }
  const ids = new Set(rows.map(row => row.item_id));
  return [...ids].filter(id => {
    const item = Object.hasOwn(items, id) ? items[id] : null;
    return item && (category === "upgrade" ? ["weapon", "armor"].includes(item.type)
      : ["weapon", "armor", "accessory"].includes(item.type) && item.salvageable !== false);
  }).map(id => ({ id, itemId: id, name: items[id].name }));
}

export function copiesFor(rows, itemId) {
  // Select an unlocked, unequipped, low-reinforcement copy first.
  return rows.filter(row => row.item_id === itemId).sort((a, b) =>
    Number(Boolean(a.is_locked || a.is_equipped)) - Number(Boolean(b.is_locked || b.is_equipped)) ||
    a.upgrade_level - b.upgrade_level || a.serial_number - b.serial_number);
}

export function affordableBatch(recipe, rows, balance, max = 10) {
  if (!recipe || recipe.baseItemId) return 1;
  let possible = recipe.fee > 0 ? Math.floor(balance / recipe.fee) : max;
  for (const ingredient of recipe.ingredients) {
    const available = rows.filter(row => row.item_id === ingredient.itemId && !row.is_locked && !row.is_equipped).length;
    possible = Math.min(possible, Math.floor(available / ingredient.quantity));
  }
  return Math.max(0, Math.min(max, possible));
}

export function pageBounds(page, length, size = 25) {
  const pages = Math.max(1, Math.ceil(length / size));
  return { page: Number.isSafeInteger(page) ? Math.max(0, Math.min(page, pages - 1)) : 0, pages };
}
