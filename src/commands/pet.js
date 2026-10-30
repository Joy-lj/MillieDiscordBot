import { EmbedBuilder } from "discord.js";
import { getPet, getPetFood } from "../database/pets.js";

const STAGE_NAMES = {
  1: "Baby 🍼",
  2: "Teen ⚡",
  3: "Adult (Max Evolution) ⭐"
};

const PET_EMOJIS = {
  dog: "🐶",
  cat: "🐱",
  bird: "🐦"
};

export async function petCommand(message) {
  const pet = await getPet(message.guild.id, message.author.id);
  const foodCount = await getPetFood(message.guild.id, message.author.id);

  const embed = new EmbedBuilder()
    .setColor(0x00aaff)
    .setTitle(`🐾 ${message.author.username}'s Pet Profile`)
    .setTimestamp();

  if (!pet) {
    embed.setDescription("You don't have a pet yet! Use `!claimpet <dog|cat|bird>` to adopt one.");
  } else {
    const timeSinceFed = pet.last_fed_at === 0 ? "Never" : `<t:${Math.floor(pet.last_fed_at / 1000)}:R>`;

    embed.setDescription(
      `**Pet Type:** ${PET_EMOJIS[pet.pet_type]} ${pet.pet_type.toUpperCase()}\n` +
      `**Evolution Stage:** ${STAGE_NAMES[pet.stage] || "Stage " + pet.stage}\n` +
      `**Pet XP:** ${pet.xp} XP\n` +
      `**Food in Inventory:** 🍪 ${foodCount} packs\n` +
      `**Last Fed:** ${timeSinceFed}\n\n` +
      `*Tip: Use \`!feedpet\` every hour to gain XP and evolve your pet!*`
    );
  }

  await message.reply({ embeds: [embed] });
}