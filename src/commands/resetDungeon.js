import { PermissionFlagsBits } from "discord.js";
import db from "../database/connection.js";

const adminIDs = new Set([
    "428738370022277121",
    "813870343767982100",
]);
const quiet = { parse: [], repliedUser: false };

export async function resetDungeonCommand(message) {
    // Check if the user has Administrator permissions
    // if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    //   return message.reply("❌ You do not have permission to use this command.");
    // }
    if (!message.inGuild() || message.author.bot) return;

    if (!adminIDs.has(message.author.id)) {
        await message.reply("❌ Only authorized administrators can use this command.");
        return;
    }


    const args = message.content.trim().split(/\s+/);
    const mention = args[1]?.match(/^<@!?(\d+)>$/);

    if (args.length > 2 || (args[1] && !mention)) {
        return message.reply({
            content: "Usage: `!resetdungeon [@user]`",
            allowedMentions: quiet,
        });
    }

    const target = mention
        ? message.mentions.users.get(mention[1])
        : message.author;

    if (!target || target.bot) {
        return message.reply({
            content: "❌ Please mention a valid player.",
            allowedMentions: quiet,
        });
    }

    let result;

    try {
        result = await db.query(
            `UPDATE public.dungeon_members
       SET next_entry_at = 0
       WHERE guild_id = $1 AND user_id = $2
       RETURNING user_id`,
            [message.guildId, target.id]
        );
    } catch (error) {
        console.error("Dungeon cooldown reset failed:", error);

        return message.reply({
            content: "❌ Could not confirm the cooldown reset. Check the bot log.",
            allowedMentions: quiet,
        });
    }

    await message.reply({
        content: result.rows.length
            ? `✅ Reset the dungeon entry cooldown for <@${target.id}>.`
            : `✅ <@${target.id}> has no saved dungeon entry cooldown.`,
        allowedMentions: quiet,
    });
}