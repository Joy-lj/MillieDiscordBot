import { claimUserPet } from "../database/pets.js";

const VALID_PETS = ["dog", "cat", "bird"];

const PET_EMOJIS = {
  dog: "🐶 Dog",
  cat: "🐱 Cat",
  bird: "🐦 Bird"
};

export async function claimPetCommand(message) {
  const args = message.content.trim().split(/\s+/);
  const petType = args[1]?.toLowerCase();

  if (!VALID_PETS.includes(petType)) {
    return message.reply("Please choose a valid pet to claim! Usage: `!claimpet dog`, `!claimpet cat`, or `!claimpet bird`");
  }

  const result = claimUserPet(message.guild.id, message.author.id, petType);

  if (!result.success) {
    if (result.reason === "already_claimed") {
      return message.reply(`You already adopted a **${result.petType}**! Use \`!pet\` to check on it.`);
    }
  }

  await message.reply(`🎉 Congratulations! You successfully claimed your new **${PET_EMOJIS[petType]}**! Use \`!pet\` to view its stats and \`!petshop\` to buy food.`);
}