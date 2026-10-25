import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { flowers } from "../src/config/flowerPoker.js";

// Find .env in the main project folder.
const envPath = fileURLToPath(new URL("../.env", import.meta.url));

// Load its variables.
const loaded = dotenv.config({ path: envPath });

if (loaded.error) {
  throw new Error(`Could not load .env: ${loaded.error.message}`);
}

const guildId = process.env.FLOWER_GUILD_ID;

console.log({
  envPath,
  hasGuildId: Boolean(guildId),
  hasToken: Boolean(process.env.TOKEN),
});

if (!guildId || !process.env.TOKEN) {
  throw new Error("Set FLOWER_GUILD_ID and TOKEN in .env first.");
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const ready = new Promise((resolve) => client.once(Events.ClientReady, resolve));

async function loadIcon(flower) {
  // Local files take priority when the wiki blocks automated downloads.
  try {
    return await readFile(new URL(`../assets/flowers/${flower.id}.png`, import.meta.url));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const url = `https://oldschool.runescape.wiki/images/${flower.file}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "FlowerPokerDiscordSetup/1.0" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) {
    throw new Error(`Could not download ${flower.label}. Save its PNG as assets/flowers/${flower.id}.png and retry.`);
  }
  return Buffer.from(await response.arrayBuffer());
}

try {
  await client.login(process.env.TOKEN);
  await ready;
  const guild = await client.guilds.fetch(guildId);
  await guild.emojis.fetch();
  for (const flower of flowers) {
    if (guild.emojis.cache.some((emoji) => emoji.name === flower.emojiName)) {
      console.log(`Already exists: ${flower.emojiName}`);
      continue;
    }
    try {
      const attachment = await loadIcon(flower);
      const emoji = await guild.emojis.create({
        name: flower.emojiName,
        attachment,
        reason: "Install flower poker icons",
      });
      console.log(`Created ${emoji.name}: ${emoji.toString()}`);
    } catch (error) {
      console.error(`${flower.label}: ${error.message}`);
      process.exitCode = 1;
    }
  }
} finally {
  client.destroy();
}
