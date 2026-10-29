import { feedUserPet } from "../database/pets.js";

export async function feedPetCommand(message) {
  const result = feedUserPet(message.guild.id, message.author.id);

  if (!result.success) {
    if (result.reason === "no_pet") {
      return message.reply("You don't have a pet yet! Claim one first using `!claimpet <dog|cat|bird>`.");
    }
    if (result.reason === "no_food") {
      return message.reply("You are out of pet food! Visit the `!petshop` and buy some using `!buyfood`.");
    }
    if (result.reason === "cooldown") {
      const remainingTime = Math.ceil((result.nextFeedAt - Date.now()) / 1000 / 60);
      return message.reply(`Your pet is still full! You can feed your pet again in about **${remainingTime} minutes**.`);
    }
  }

  let replyText = `🍖 You fed your **${result.petType}**! (+25 XP, Total XP: ${result.xp}). Remaining food: ${result.remainingFood}`;
  
  if (result.evolved) {
    replyText += `\n\n✨ **CONGRATULATIONS!** Your pet evolved to **Stage ${result.stage}**! 🎉`;
  }

  await message.reply(replyText);
}