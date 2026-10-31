import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";

const GIVE_ADMIN_IDS = [
  "428738370022277121",
  "813870343767982100",
];

const quiet = { parse: [], repliedUser: false };

export async function helpCommand(message) {
  if (!message.inGuild() || message.author.bot) return;

  const staffCommands = [];

  if (GIVE_ADMIN_IDS.includes(message.author.id)) {
    staffCommands.push(
      "`!give @user <amount>` — Add currency to a player."
    );
  }

  if (
    message.member?.permissions.has(PermissionFlagsBits.Administrator)
  ) {
    staffCommands.push(
      "`!remove @user <amount>` — Remove currency from a player.",
      "`!resetdungeon [@user]` — Clear dungeon entry cooldown; defaults to yourself.",
      "`!wipe` — Reset the server economy after confirmation."
    );
  }

  const pages = [
    [
      {
        name: "💰 Economy & Ranks",
        value: [
          "`!balance` — Check your balance.",
          "`!level` / `!rank` — View your level and XP.",
          "`!daily` — Claim your daily reward.",
          "`!work` — Work to earn currency.",
          "`!leaderboard` / `!baltop` — View the richest players.",
          "`!donate @user <amount>` — Transfer currency to another player.",
        ].join("\n"),
      },
      {
        name: "🎣 Fishing",
        value: [
          "`!fish` — Cast your line and catch a fish.",
          "`!fishbag` — Browse and sell your catches.",
          "Bag controls let you sell one fish, a stack, or everything.",
        ].join("\n"),
      },
      {
        name: "🎲 Gambling & Minigames",
        value: [
          "`!dice <amount>` — Roll 1–100; 55+ returns 2× your wager.",
          "`!blackjack <amount>` / `!bj <amount>` — Play blackjack.",
          "`!hc <hot|cold> <amount>` — Bet on a flower.",
          "`!flowerpoker @user <amount>` / `!fp @user <amount>` — Challenge someone to flower poker.",
          "`!rps @user <amount>` — Play rock, paper, scissors.",
        ].join("\n"),
      },
      {
        name: "🛒 Shop & Equipment",
        value: [
          "`!shop` — Browse equipment using Buy buttons.",
          "`!buy <name or item-id> [quantity]` — Search and review a purchase.",
          "`!inventory` — View your gear and serial numbers.",
          "`!equip <item-id> <serial-number>` — Equip an item.",
          "`!unequip <weapon|armor>` — Clear an equipment slot.",
          "`!unequip <item-id> <serial-number>` — Unequip a specific item.",
          "`!sell <item-id> <serial-number>` — Sell an owned item.",
          "Dungeon-exclusive equipment cannot be purchased.",
        ].join("\n"),
      },
      {
        name: "🏰 Dungeons",
        value: [
          "`!dungeon solo [easy|normal|hard]` — Start a solo run.",
          "`!dungeon @user [easy|normal|hard]` — Invite a partner.",
          "`!dungeon` — Resume your dungeon.",
          "`!dungeon rewards` — Find an unclaimed reward.",
          "Clear three rooms for currency and one loot roll per player.",
          "**Equipment odds:** Easy 2% • Normal 4% • Hard 6%.",
          "Hard's two rarest drops are **0.1% each**.",
        ].join("\n"),
      },
      {
        name: "🤺 Player Combat",
        value:
          "`!duel @user <wager>` — Challenge a player to a wagered duel.",
      },
    ],
    [
      {
        name: "🎴 Cards & Packs",
        value: [
          "`!cardshop` — Browse packs, prices, and availability.",
          "`!packs` — View your unopened packs.",
          "`!cards` — Browse your card collection.",
          "Use shop buttons to buy packs and pack controls to open or sell them.",
        ].join("\n"),
      },
      {
        name: "🐾 Pets",
        value: [
          "`!claimpet <dog|cat|bird>` — Adopt a companion.",
          "`!pet` / `!mypet` — View your pet's stage and XP.",
          "`!petshop` — View pet food and its current price.",
          "`!buyfood` — Buy one unit of pet food.",
          "`!feedpet` — Feed your pet hourly to gain XP and evolve.",
        ].join("\n"),
      },
      {
        name: "✨ Evolved Pet Bonuses",
        value: [
          "**🐶 Dog:** Boosts daily rewards.",
          "**🐱 Cat:** Improves work luck.",
          "**🐦 Bird:** Reduces your fishing cooldown.",
        ].join("\n"),
      },
      {
        name: "🔧 Administration",
        value: staffCommands.length
          ? staffCommands.join("\n")
          : "Administration commands are restricted to authorized staff.",
      },
    ],
  ];

  let currentPage = 0;

  const previousId = `help:${message.id}:previous`;
  const nextId = `help:${message.id}:next`;

  function buildEmbed() {
    return new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle(
        currentPage === 0
          ? "🐱 Millie's Guide • Economy & Adventures"
          : "🐱 Millie's Guide • Cards, Pets & Administration"
      )
      .setDescription(
        "`<argument>` means required • `[argument]` means optional"
      )
      .addFields(...pages[currentPage])
      .setFooter({
        text: `Page ${currentPage + 1}/${pages.length} • Controls expire after 2 minutes`,
      });
  }

  function buildButtons(expired = false) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(previousId)
        .setLabel("Previous")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(expired || currentPage === 0),

      new ButtonBuilder()
        .setCustomId(nextId)
        .setLabel("Next")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(expired || currentPage === pages.length - 1)
    );
  }

  const reply = await message.reply({
    embeds: [buildEmbed()],
    components: [buildButtons()],
    allowedMentions: quiet,
  });

  const collector = reply.createMessageComponentCollector({
    filter: (interaction) =>
      interaction.isButton() &&
      [previousId, nextId].includes(interaction.customId),
    time: 120_000,
  });

  // Keep rapid button clicks in order.
  let updates = Promise.resolve();

  collector.on("collect", async (interaction) => {
    try {
      if (interaction.user.id !== message.author.id) {
        await interaction.reply({
          content: "These controls belong to another player. Use !help.",
          flags: MessageFlags.Ephemeral,
          allowedMentions: quiet,
        });
        return;
      }

      await interaction.deferUpdate();

      updates = updates
        .then(async () => {
          currentPage = Math.max(
            0,
            Math.min(
              pages.length - 1,
              currentPage +
              (interaction.customId === nextId ? 1 : -1)
            )
          );

          await reply.edit({
            embeds: [buildEmbed()],
            components: [buildButtons(collector.ended)],
            allowedMentions: quiet,
          });
        })
        .catch((error) => {
          console.error("Help pagination failed:", error);
        });
    } catch (error) {
      console.error("Help interaction failed:", error);
    }
  });

  collector.on("end", () => {
    void updates
      .then(() =>
        reply.edit({
          components: [buildButtons(true)],
        })
      )
      .catch((error) => {
        console.error("Could not disable help buttons:", error);
      });
  });
}