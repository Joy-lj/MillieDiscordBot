import { balanceCommand } from "./commands/balance.js";
import { initializeDatabase } from "./database/connection.js";
import "dotenv/config";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { dailyCommand } from "./commands/daily.js";
import { leaderboardCommand } from "./commands/leaderboard.js";
import { giveCommand } from "./commands/give.js";
import { workCommand } from "./commands/work.js";
import { removeCommand } from "./commands/remove.js";

// Choose which Discord events the bot can receive.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Runs once the bot successfully connects.
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.inGuild()) return;

  try {
    if (message.content.trim().toLowerCase() === "!balance") {
      await balanceCommand(message);
    }
    if (message.content.trim().toLowerCase() === "!daily") {
      await dailyCommand(message);
    }
    if (message.content.trim().toLowerCase() === "!leaderboard") {
      await leaderboardCommand(message);
    }
    if (message.content.trim().split(/\s+/)[0].toLowerCase() === "!give") {
      await giveCommand(message);
    }
    if (message.content.trim().toLowerCase() === "!work") {
      await workCommand(message);
    }
    if (message.content.trim().split(/\s+/)[0].toLowerCase() === "!remove") {
      await removeCommand(message);
    }
  } catch (error) {
    console.error("Command failed:", error);
  }
});

// Log in using the token from .env.
async function startBot() {
  await initializeDatabase();
  await client.login(process.env.TOKEN);
}

startBot().catch(console.error);