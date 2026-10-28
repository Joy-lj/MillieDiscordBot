import { randomInt } from "node:crypto";

export function validateOffer(offer) {
  if (!/^[a-z0-9_-]+$/.test(offer.id) || !offer.name || !Array.isArray(offer.setIds) || !offer.setIds.length) {
    throw new Error("Pack needs an ID, name, and source sets.");
  }
  for (const amount of [offer.price, offer.sellPrice]) {
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("Invalid pack price.");
  }
  if (offer.price < 1 || offer.sellPrice > offer.price) throw new Error("Invalid buy/sell price relationship.");
  if (!Array.isArray(offer.slots) || offer.slots.length < 1 || offer.slots.length > 10) throw new Error("Use 1–10 slots.");
  for (const slot of offer.slots) {
    const entries = Object.entries(slot);
    if (!entries.length || entries.some(([group,weight]) =>
      !["common","uncommon","rare","special"].includes(group) || !Number.isSafeInteger(weight) || weight <= 0)) {
      throw new Error("Slot weights must be positive integers for known groups.");
    }
    if (entries.reduce((sum,[,weight]) => sum+weight,0) > 1_000_000) throw new Error("Slot weights too large.");
  }
}

export function chooseGroup(weights, rng = randomInt) {
  const total = Object.values(weights).reduce((sum,weight) => sum+weight,0);
  let roll = rng(total);
  if (!Number.isInteger(roll) || roll < 0 || roll >= total) throw new Error("Invalid random result.");
  for (const [group,weight] of Object.entries(weights)) {
    if (roll < weight) return group;
    roll -= weight;
  }
  throw new Error("Invalid weights.");
}

export function chooseCards(snapshot, rng = randomInt) {
  validateOffer(snapshot);
  return snapshot.slots.map((weights) => {
    const group = chooseGroup(weights,rng);
    const pool = snapshot.pools[group];
    if (!Array.isArray(pool) || !pool.length) throw new Error(`No eligible ${group} cards. Pack was not consumed.`);
    const index = rng(pool.length);
    if (!Number.isInteger(index) || index < 0 || index >= pool.length) throw new Error("Invalid card draw.");
    return pool[index];
  });
}
