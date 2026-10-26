import { balanceCommand } from "./commands/balance.js";
import { initializeDatabase } from "./database/connection.js";
import "dotenv/config";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { dailyCommand } from "./commands/daily.js";
import { leaderboardCommand } from "./commands/leaderboard.js";
import { giveCommand } from "./commands/give.js";
import { workCommand } from "./commands/work.js";
import { removeCommand } from "./commands/remove.js";
import { betCommand } from "./commands/bet.js";
import { initializeBetting } from "./database/bets.js";
import { resetCommand } from "./commands/reset.js";
import { donateCommand } from "./commands/donate.js";
import { helpCommand } from "./commands/help.js";
import { inventoryCommand } from "./commands/inventory.js";
import { shopCommand, buyCommand } from "./commands/shop.js";
import { sellCommand } from "./commands/sell.js";
import { flowerPokerCommand } from "./commands/flowerpoker.js";
import { equipCommand } from "./commands/equip.js";
import { unequipCommand } from "./commands/unequip.js";
import { duelCommand } from "./commands/duel.js";
import { cardShopCommand, buyCardCommand, sellCardCommand } from "./commands/cardshop.js";
import { hotColdCommand } from "./commands/hc.js";
import { cardInventoryCommand } from "./commands/cardinventory.js";

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
    if (message.content.trim().toLowerCase() === "!balance" || message.content.trim().toLowerCase() === "!bal") {
      await balanceCommand(message);
    }
    if (message.content.trim().toLowerCase() === "!daily") {
      await dailyCommand(message);
    }
    if (message.content.trim().toLowerCase() === "!baltop" || message.content.trim().toLowerCase() === "!leaderboard") {
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
    if (
      ["!dice", "!blackjack", "!bj"].includes(
        message.content.trim().split(/\s+/)[0].toLowerCase()
      )
    ) {
      await betCommand(message);
    }
    if (message.content.trim().split(/\s+/)[0].toLowerCase() === "!reset") {
      await resetCommand(message);
    }
    if (message.content.trim().split(/\s+/)[0].toLowerCase() === "!donate") {
      await donateCommand(message);
    }
    if (message.content.trim().toLowerCase() === "!help") {
      await helpCommand(message);
    }
    if (message.content.trim().toLowerCase() === "!shop") {
      await shopCommand(message);
    }
    if (message.content.trim().split(/\s+/)[0].toLowerCase() === "!buy") {
      await buyCommand(message);
    }
    if (["!inventory", "!inv"].includes(message.content.trim().split(/\s+/)[0].toLowerCase())) {
      await inventoryCommand(message);
    }
    if (message.content.trim().split(/\s+/)[0].toLowerCase() === "!sell") {
      await sellCommand(message);
    }
    if (
      ["!fp", "!flowerpoker"].includes(
        message.content.trim().split(/\s+/)[0].toLowerCase()
      )
      ) {
        await flowerPokerCommand(message);
    }
    if (message.content.trim().split(/\s+/)[0].toLowerCase() === "!equip") {
      await equipCommand(message);
    }
    if (message.content.trim().split(/\s+/)[0].toLowerCase() === "!unequip") {
      await unequipCommand(message);
    }
    if (message.content.trim().split(/\s+/)[0].toLowerCase() === "!duel") {
      await duelCommand(message);
    }
    if (message.content.trim().toLowerCase() === "!cardshop") {
      await cardShopCommand(message);
    }
    if (message.content.trim().split(/\s+/)[0].toLowerCase() === "!buycard") {
      await buyCardCommand(message);
    }
    if (message.content.trim().split(/\s+/)[0].toLowerCase() === "!sellcard") {
      await sellCardCommand(message);
    }
    if (
      message.content.trim().split(/\s+/)[0].toLowerCase() === "!hc"
    ) {
      await hotColdCommand(message);
    }
    if (
      ["!cardinventory", "!cardinv"].includes(
        message.content.trim().split(/\s+/)[0].toLowerCase()
      )
    ) {
      await cardInventoryCommand(message);
    }
  } catch (error) {
    console.error("Command failed:", error);
  }
});

// Log in using the token from .env.
async function startBot() {
  initializeDatabase();
  initializeBetting();

  await client.login(process.env.TOKEN);
}

startBot().catch(console.error);


client.on("interactionCreate", async (interaction) => {
  // If an interaction isn't handled by any active message component collector,
  // ensure it doesn't leave Discord waiting indefinitely.
  if (!interaction.isButton() || !interaction.isStringSelectMenu()) return;
});