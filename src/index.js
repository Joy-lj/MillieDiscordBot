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
import { hotColdCommand } from "./commands/hc.js";
import { levelCommand } from "./commands/level.js";
import { initializeCardShop } from "./database/cardShop.js";
import { addXp } from "./database/accounts.js";
import { adminXpCommand } from "./commands/adminXp.js"; 
import { cardShopCommand, packsCommand, cardsCommand, handleCardShopInteraction } from "./commands/cardShop.js";
import {rpsCommand} from "./commands/rps.js";

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
    const cardCommand = message.content
    .trim()
    .split(/\s+/)[0]
    .toLowerCase();

  if (cardCommand === "!cardshop") {
    await cardShopCommand(message);
  } else if (cardCommand === "!packs") {
  await packsCommand(message);
  } else if (cardCommand === "!cards") {
    await cardsCommand(message);
  }
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
    if (message.content.trim().toLowerCase() === "!level" || message.content.trim().toLowerCase() === "!rank") {
      await levelCommand(message);
    }

    if (message.content.trim().toLowerCase() === "!adminxp") {
      await adminXpCommand(message);
    }

    if (message.content.trim().split(/\s+/)[0].toLowerCase() === "!rps") {
      await rpsCommand(message);
    } 
  

    const xpGained = Math.floor(Math.random() * 11) + 15; // Random 15-25 XP
    const xpResult = addXp(message.guild.id, message.author.id, xpGained);

    // Announce level-ups in chat if they leveled up
    if (xpResult.leveledUp) {
      let levelUpText = `🎉 Congratulations <@${message.author.id}>! You leveled up to **Level ${xpResult.newLevel}**!`;
      if (xpResult.rewardGiven > 0) {
        levelUpText += ` 💰 Milestone reward: **${xpResult.rewardGiven} cookies**!`;
      }
      
      // --- AUTOMATIC ROLE ASSIGNMENT ---
      try {
        const member = message.member; // Get the guild member object
        
        // Example: Assign a specific role ID based on their level milestone
        // Make sure to replace these placeholder strings with your actual Discord Role IDs!
        let roleIdToAssign = null;
        
        if (xpResult.newLevel === 5) {
          roleIdToAssign = "1565118264793628692";
        } else if (xpResult.newLevel === 10) {
          roleIdToAssign = "YOUR_LEVEL_10_ROLE_ID";
        } else if (xpResult.newLevel === 15) {
          roleIdToAssign = "YOUR_LEVEL_15_ROLE_ID";
        }
        // You can add more thresholds or map every multiple of 5 dynamically!

        if (roleIdToAssign) {
          await member.roles.add(roleIdToAssign);
          levelUpText += ` 🎖️ You were awarded a new role for reaching **Level ${xpResult.newLevel}**!`;
        }
      } catch (roleError) {
        console.error("Failed to assign level role (Check bot permissions & role hierarchy):", roleError);
      }

      const primaryCommand = message.content.trim().split(/\s+/)[0].toLowerCase();

      message.channel.send(levelUpText).catch(() => {});
    }

  } catch (error) {
    console.error("Command failed:", error);
  }
});

// Log in using the token from .env.
async function startBot() {
  initializeDatabase();
  initializeBetting();
  initializeCardShop();
  await client.login(process.env.TOKEN);
}

startBot().catch(console.error);


client.on("interactionCreate", async (interaction) => {
  // If an interaction isn't handled by any active message component collector,
  // ensure it doesn't leave Discord waiting indefinitely.
  if (await handleCardShopInteraction(interaction)) return;
  if (!interaction.isButton() || !interaction.isStringSelectMenu()) return;
  
});