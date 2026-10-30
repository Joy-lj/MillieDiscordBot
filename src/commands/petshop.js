import { EmbedBuilder } from "discord.js";
import { buyPetFood } from "../database/pets.js";
import { economyConfig } from "../config/economy.js";

const FOOD_COST = 5000;

const money = (amount) =>
  `${amount.toLocaleString("en-US")} ${economyConfig.currencyName}`;

export async function petShopCommand(message) {
  if (!message.inGuild() || message.author.bot) return;

  const embed = new EmbedBuilder()
    .setColor(0xffaa00)
    .setTitle("🛒 Pet Shop")
    .setDescription(
      "Buy delicious pet food to feed and evolve your pets!\n\n" +
      `Use \`!buyfood\` to purchase **1 Pet Food** for **${money(FOOD_COST)}**.`
    );

  await message.reply({
    embeds: [embed],
    allowedMentions: { parse: [], repliedUser: false },
  });
}

export async function buyFoodCommand(message) {
  if (!message.inGuild() || message.author.bot) return;

  const result = await buyPetFood(
    message.guildId,
    message.author.id,
    FOOD_COST
  );

  if (!result.success) {
    if (result.reason === "insufficient_funds") {
      return message.reply(
        `You don't have enough currency! Pet food costs **${money(result.cost)}**.`
      );
    }

    return message.reply("Pet food could not be purchased.");
  }

  await message.reply({
    content:
      `🛒 You bought **1 Pet Food** for **${money(result.cost)}**!\n` +
      `Remaining balance: **${money(result.newBalance)}**\n` +
      `Food in stock: **${result.foodCount.toLocaleString("en-US")}**`,
    allowedMentions: { parse: [], repliedUser: false },
  });
}