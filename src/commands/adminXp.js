import { PermissionsBitField } from "discord.js";
import db from "../database/connection.js";

const adminIDs = new Set([
  "428738370022277121",
  "813870343767982100",
]);

export async function adminXpCommand(message) {
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
  const subCommand = args[1]?.toLowerCase(); // e.g., "add" or "setlevel"

  // Get the target user either from a mention or fallback to args[2] if it's an ID
  const targetUser = message.mentions.users.first();

  // Find the numeric value dynamically by looking for the first number argument in the list
  const valueArg = args.find((arg, index) => index > 1 && !isNaN(arg));
  const value = valueArg ? parseInt(valueArg, 10) : NaN;

  if (!subCommand || !["add", "setlevel"].includes(subCommand) || !targetUser || isNaN(value)) {
    return message.reply(
      "⚠️ **Invalid usage syntax!**\n" +
      "Examples:\n" +
      "`!adminxp add @user 500` - Add XP to a user\n" +
      "`!adminxp setlevel @user 5` - Set a user's level directly"
    );
  }

  // Ensure account exists
  db.prepare(`
    INSERT INTO accounts (guild_id, user_id)
    VALUES (?, ?)
    ON CONFLICT (guild_id, user_id) DO NOTHING
  `).run(message.guild.id, targetUser.id);

  if (subCommand === "add") {
    const account = db.prepare(`SELECT level, xp, balance FROM accounts WHERE guild_id = ? AND user_id = ?`).get(message.guild.id, targetUser.id);

    let { level, xp, balance } = account;
    xp += value;
    let xpNeeded = level * 150;

    let leveledUp = false;
    while (xp >= xpNeeded) {
      xp -= xpNeeded;
      level += 1;
      leveledUp = true;
      if (level % 5 === 0) {
        balance += (level / 5) * 250;
      }
      xpNeeded = level * 150;
    }

    db.prepare(`
      UPDATE accounts SET level = ?, xp = ?, balance = ?
      WHERE guild_id = ? AND user_id = ?
    `).run(level, xp, balance, message.guild.id, targetUser.id);

    return message.reply(`✅ Successfully added **${value} XP** to <@${targetUser.id}>. They are now **Level ${level}** (${xp} / ${xpNeeded} XP).`);
  }

  if (subCommand === "setlevel") {
    const newLevel = Math.max(1, value);
    db.prepare(`
      UPDATE accounts SET level = ?, xp = 0 WHERE guild_id = ? AND user_id = ?
    `).run(newLevel, message.guild.id, targetUser.id);

    return message.reply(`✅ Successfully set <@${targetUser.id}>'s level to **Level ${newLevel}** (XP reset to 0 for this level).`);
  }
}