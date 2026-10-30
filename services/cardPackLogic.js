import { randomInt } from "node:crypto";

const GROUPS = ["common", "uncommon", "rare", "special"];

function validateWeights(weights) {
  if (!weights || typeof weights !== "object" || Array.isArray(weights)) {
    throw new Error("Slot weights must be an object.");
  }
  const entries = Object.entries(weights);
  if (!entries.length || entries.some(([group, weight]) =>
    !GROUPS.includes(group) || !Number.isSafeInteger(weight) || weight <= 0)) {
    throw new Error("Slot weights must be positive integers for known groups.");
  }
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (!Number.isSafeInteger(total) || total > 1_000_000) {
    throw new Error("Slot weights too large.");
  }
  return total;
}

export function validateOffer(offer) {
  if (!offer || typeof offer.id !== "string" || !/^[a-z0-9_-]+$/.test(offer.id) ||
      typeof offer.name !== "string" || !offer.name.trim() ||
      !Array.isArray(offer.setIds) || !offer.setIds.length ||
      offer.setIds.some((id) => typeof id !== "string" || !id.trim())) {
    throw new Error("Pack needs an ID, name, and source sets.");
  }
  for (const amount of [offer.price, offer.sellPrice]) {
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("Invalid pack price.");
  }
  if (offer.price < 1 || offer.sellPrice > offer.price) {
    throw new Error("Invalid buy/sell price relationship.");
  }
  if (!Array.isArray(offer.slots) || offer.slots.length < 1 || offer.slots.length > 10) {
    throw new Error("Use 1–10 slots.");
  }
  for (const slot of offer.slots) validateWeights(slot);
}

export function chooseGroup(weights, rng = randomInt) {
  const total = validateWeights(weights);
  let roll = rng(total);
  if (!Number.isInteger(roll) || roll < 0 || roll >= total) throw new Error("Invalid random result.");
  for (const [group, weight] of Object.entries(weights)) {
    if (roll < weight) return group;
    roll -= weight;
  }
  throw new Error("Invalid weights.");
}

export function chooseCards(snapshot, rng = randomInt) {
  validateOffer(snapshot);
  // Validate every required pool before consuming randomness.
  for (const slot of snapshot.slots) {
    for (const group of Object.keys(slot)) {
      const pool = snapshot.pools?.[group];
      if (!Array.isArray(pool) || !pool.length ||
          pool.some((key) => typeof key !== "string" || !key)) {
        throw new Error(`No eligible ${group} cards. Pack was not consumed.`);
      }
    }
  }
  return snapshot.slots.map((weights) => {
    const group = chooseGroup(weights, rng);
    const pool = snapshot.pools[group];
    const index = rng(pool.length);
    if (!Number.isInteger(index) || index < 0 || index >= pool.length) {
      throw new Error("Invalid card draw.");
    }
    return pool[index];
  });
}
