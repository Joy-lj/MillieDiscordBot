import { createHash } from "node:crypto";

import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    MessageFlags,
    PermissionFlagsBits,
} from "discord.js";

import db from "../database/connection.js";
const adminIDs = new Set([
    "428738370022277121",
    "813870343767982100",
]);
const quiet = { parse: [], repliedUser: false };

async function resetServerItems(guildId) {

    const client = await db.connect();

    try {
        await client.query("BEGIN");

        // Matches the lock used by the dungeon store.
        // Prevents dungeon entry/actions during the reset transaction.
        const dungeonLock = createHash("sha256")
            .update(`dungeon:${guildId}`)
            .digest()
            .readBigInt64BE(0)
            .toString();

        await client.query(
            "SELECT pg_advisory_xact_lock($1::bigint)",
            [dungeonLock]
        );

        // Coordinate with item purchases, sales, and equipment changes
        // that also lock the owner's account.
        await client.query(
            `SELECT user_id
       FROM public.accounts
       WHERE guild_id = $1
       ORDER BY user_id
       FOR UPDATE`,
            [guildId]
        );

        const activeDungeon = await client.query(
            `SELECT id
       FROM public.dungeon_runs
       WHERE guild_id = $1
         AND status IN ('invited', 'active')
       LIMIT 1`,
            [guildId]
        );

        if (activeDungeon.rows.length) {
            await client.query("ROLLBACK");

            return {
                success: false,
                reason: "active_dungeon",
            };
        }

        const equipment = await client.query(
            `DELETE FROM public.user_equipment
       WHERE guild_id = $1`,
            [guildId]
        );

        // Clear the legacy equipment pointers too.
        await client.query(
            `UPDATE public.accounts
       SET equipped_weapon_id = NULL,
           equipped_armor_id = NULL
       WHERE guild_id = $1`,
            [guildId]
        );

        const items = await client.query(
            `DELETE FROM public.user_items
       WHERE guild_id = $1`,
            [guildId]
        );

        await client.query("COMMIT");

        return {
            success: true,
            itemsDeleted: items.rowCount,
            equipmentCleared: equipment.rowCount,
        };
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            console.error("Item reset rollback failed:", rollbackError);
        }

        throw error;
    } finally {
        client.release();
    }
}

export async function resetItemsCommand(message) {

    if (!message.inGuild() || message.author.bot) return;

    if (!adminIDs.has(message.author.id)) {
        await message.reply("❌ Only authorized administrators can use this command.");
        return;
    }

    const confirmId = `resetitems:${message.id}:confirm`;
    const cancelId = `resetitems:${message.id}:cancel`;

    const controls = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(confirmId)
            .setLabel("Delete all server gear")
            .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
            .setCustomId(cancelId)
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Secondary)
    );

    const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle("⚠️ Reset Item Economy?")
        .setDescription(
            "This permanently deletes **every player's owned gear " +
            "and equipped loadout in this server**, including dungeon drops.\n\n" +
            "**Balances, cards, packs, fish, pets, levels, and XP stay unchanged.**\n\n" +
            "No currency is refunded. This cannot be undone through the bot.\n\n" +
            "Confirm within **30 seconds**."
        );

    const reply = await message.reply({
        embeds: [embed],
        components: [controls],
        allowedMentions: quiet,
    });

    let handled = false;

    const collector = reply.createMessageComponentCollector({
        filter: (interaction) =>
            interaction.isButton() &&
            [confirmId, cancelId].includes(interaction.customId),
        time: 30_000,
    });

    collector.on("collect", async (interaction) => {
        try {
            if (interaction.user.id !== message.author.id) {
                await interaction.reply({
                    content: "Only the administrator who started this reset can respond.",
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            // Check current permissions again before accepting confirmation.
            const member = await message.guild.members.fetch(
                interaction.user.id
            );

            if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
                await interaction.reply({
                    content: "❌ Administrator permission is required.",
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            if (handled) {
                await interaction.deferUpdate();
                return;
            }

            // Set before awaiting so rapid clicks cannot run two resets.
            handled = true;
            collector.stop("handled");

            await interaction.deferUpdate();

            if (interaction.customId === cancelId) {
                await interaction.editReply({
                    content: "✅ Item reset canceled.",
                    embeds: [],
                    components: [],
                    allowedMentions: quiet,
                });
                return;
            }

            await interaction.editReply({
                content: "⏳ Resetting server items…",
                embeds: [],
                components: [],
                allowedMentions: quiet,
            });

            let result;

            try {
                result = await resetServerItems(message.guildId);
            } catch (error) {
                console.error("Server item reset failed:", error);

                await interaction.editReply({
                    content:
                        "❌ Couldn't confirm the reset. Check the bot log " +
                        "and server inventories before trying again.",
                    embeds: [],
                    components: [],
                    allowedMentions: quiet,
                });

                return;
            }

            if (!result.success) {
                await interaction.editReply({
                    content:
                        "❌ Finish, decline, or leave all pending and active " +
                        "dungeons before resetting items. Resume expired " +
                        "dungeons with `!dungeon` to let them expire.",
                    embeds: [],
                    components: [],
                    allowedMentions: quiet,
                });

                return;
            }

            const receipt = new EmbedBuilder()
                .setColor(0x2ecc71)
                .setTitle("🧹 Item Economy Reset")
                .setDescription(
                    `Deleted **${result.itemsDeleted.toLocaleString("en-US")} ` +
                    `owned items**.\n` +
                    `Cleared **${result.equipmentCleared.toLocaleString("en-US")} ` +
                    `equipment slots**.\n\n` +
                    "Balances and other inventories were preserved."
                );

            // The reset has committed. A Discord error must not repeat it.
            await interaction.editReply({
                content: null,
                embeds: [receipt],
                components: [],
                allowedMentions: quiet,
            });
        } catch (error) {
            console.error("Item reset interaction failed:", error);
        }
    });

    collector.on("end", (_, reason) => {
        if (reason !== "time" || handled) return;

        handled = true;

        void reply.edit({
            content: "⏱️ Item reset confirmation expired. No items were deleted.",
            embeds: [],
            components: [],
            allowedMentions: quiet,
        }).catch(console.error);
    });
}