import { EmbedBuilder } from "discord.js";
import { buyPetFood, getPetFood } from "../database/pets.js";

const FOOD_COST = 5000; // Cost in Millie Cookies

export async function petShopCommand(message) {
  const embed = new EmbedBuilder()
    .setColor(0xffaa00)
    .setTitle("🛒 Pet Shop")
    .setDescription(`Buy delicious pet food to feed and evolve your pets!\nUse \`!buyfood\` to purchase 1 unit of Pet Food for **${FOOD_COST} cookies**.`);

  await message.reply({ embeds: [embed] });
}

export async function buyFoodCommand(message) {
  const result = buyPetFood(message.guild.id, message.author.id, FOOD_COST);

  if (!result.success) {
    if (result.reason === "insufficient_funds") {
      return message.reply(`You don't have enough cookies! Pet food costs **${result.cost}** cookies.`);
    }
  }

  await message.reply(`🛒 Success! You bought a pack of Pet Food for **${result.cost}** cookies. Remaining balance: **${result.newBalance}** cookies. You now have **${result.foodCount}** food in stock!`);
}