import sharp from "sharp";
import { readFile, stat } from "node:fs/promises";

import { RARITY_IMAGES } from "../src/config/rarityEmoji.js";

export const EQUIPMENT_LABELS = {
  main_hand: "Main hand", off_hand: "Off hand", head: "Head",
  torso: "Torso", legs: "Legs", hands: "Hands", feet: "Feet",
  cape: "Cape", neck: "Necklace", ring: "Ring", ammo: "Ammo",
};
const ASSETS = new URL("../assets/items/", import.meta.url);
const aliases = { "moonfang-parrying-claw": "parrying-claw" };
const cache = new Map();
const xml = (value) => String(value ?? "").replace(/[<>&"']/g,
  (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[char]));
const colors = { common: "#a3a8ac", uncommon: "#66b97c", rare: "#64a6e9", epic: "#bc8ce7", legendary: "#efc15a", mythic: "#ec7777" };

export async function itemIcon(itemId) {
  if (!/^[a-z0-9_-]+$/.test(String(itemId))) return null;
  for (const id of new Set([itemId, aliases[itemId]].filter(Boolean))) {
    const path = new URL(`${id}.png`, ASSETS);
    let info;
    try { info = await stat(path); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    if (info.size > 5_000_000) return null;
    const key = `${id}:${info.mtimeMs}:${info.size}`;
    if (cache.has(key)) {
      const image = cache.get(key);
      cache.delete(key); cache.set(key, image);
      return image;
    }
    const image = await sharp(await readFile(path), { limitInputPixels: 16_000_000 })
      .resize(100, 100, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png().toBuffer();
    cache.set(key, image);
    while (cache.size > 64) cache.delete(cache.keys().next().value);
    return image;
  }
  return null;
}

const rarityCache = new Map();

export async function rarityIcon(rarity, size = 24) {
  if (!Number.isSafeInteger(size) || size < 1 || size > 256) throw new Error("Invalid rarity image size.");
  const name = String(rarity ?? "common").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!Object.hasOwn(RARITY_IMAGES, name) || !RARITY_IMAGES[name]) return null;
  const path = RARITY_IMAGES[name];
  let info;
  try { info = await stat(path); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
  if (!info.isFile() || info.size > 5_000_000) return null;
  const key = `${String(path)}:${size}:${info.mtimeMs}:${info.size}`;
  if (rarityCache.has(key)) {
    const image = rarityCache.get(key);
    rarityCache.delete(key); rarityCache.set(key, image);
    return image;
  }
  const image = await sharp(await readFile(path), { limitInputPixels: 16_000_000 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
  rarityCache.set(key, image);
  while (rarityCache.size > 64) rarityCache.delete(rarityCache.keys().next().value);
  return image;
}

export async function renderEquipment(equipment = {}, selectedSlot = "main_hand") {
  const layout = [
    ["cape", "head", "neck"],
    ["main_hand", "torso", "off_hand"],
    ["hands", "legs", "ammo"],
    ["ring", "feet", null],
  ];
  let body = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="650">
    <rect width="600" height="650" rx="20" fill="#211e19"/>
    <text x="300" y="30" text-anchor="middle" fill="#ead8a8" font-size="18" font-family="sans-serif" font-weight="bold">MILLIE'S EQUIPMENT</text>`;
  const composites = [];
  for (let row = 0; row < layout.length; row++) {
    for (let col = 0; col < 3; col++) {
      const slot = layout[row][col];
      const x = 18 + col * 190, y = 50 + row * 146;
      const entry = slot ? equipment[slot] : null;
      const blocked = slot === "off_hand" && equipment.main_hand?.item.handedness === 2;
      const border = slot === selectedSlot ? "#f2d076" : colors[entry?.item.dungeon?.rarity] ?? "#5c5240";
      body += `<rect x="${x}" y="${y}" width="184" height="138" rx="10" fill="#302c24" stroke="${border}" stroke-width="${slot === selectedSlot ? 3 : 1.5}"/>`;
      if (!slot) {
        body += `<text x="${x+92}" y="${y+58}" text-anchor="middle" fill="#d6c49b" font-family="sans-serif" font-size="15">${Object.keys(equipment).length}/11 equipped</text>
          <text x="${x+92}" y="${y+85}" text-anchor="middle" fill="#a79b84" font-family="sans-serif" font-size="11">Select a slot below</text>`;
        continue;
      }
      body += `<text x="${x+92}" y="${y+19}" text-anchor="middle" fill="#e4d5b6" font-family="sans-serif" font-size="12">${xml(EQUIPMENT_LABELS[slot])}</text>`;
      let icon;
      if (entry && !blocked) {
        try { icon = await itemIcon(entry.itemId); }
        catch (error) { console.error(`Equipment artwork unavailable (${entry.itemId}):`, error.message); }
      }
      if (icon) composites.push({ input: icon, left: x+42, top: y+23 });
      else body += `<text x="${x+92}" y="${y+82}" text-anchor="middle" fill="#91836a" font-family="sans-serif" font-size="${entry ? 24 : 15}">${blocked ? "2H BLOCKED" : entry ? "?" : "EMPTY"}</text>`;
      if (entry && !blocked) {
        try {
          const gem = await rarityIcon(entry.item.dungeon?.rarity ?? "common", 24);
          if (gem) composites.push({ input: gem, left: x + 152, top: y + 28 });
        } catch (error) { console.error("Equipment rarity artwork unavailable:", error.message); }
      }
      const label = blocked ? "Two-handed main weapon" : entry ? entry.item.name : "";
      const short = label.length > 25 ? label.slice(0, 24)+"…" : label;
      body += `<text x="${x+92}" y="${y+130}" text-anchor="middle" fill="#d6c49b" font-family="sans-serif" font-size="10.5">${xml(short)}</text>`;
    }
  }
  body += "</svg>";
  return sharp(Buffer.from(body)).composite(composites).png().toBuffer();
}
