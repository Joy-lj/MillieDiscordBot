import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";
import { dungeonConfig } from "../config/dungeon.js";

const GIVE_ADMIN_IDS = [
  "428738370022277121",
  "813870343767982100",
];

// Matches the allowlist in spawnItem.js. Edit separately if permissions differ.
const ITEM_ADMIN_IDS = [
  "428738370022277121",
  "813870343767982100",
];

const quiet = { parse: [], repliedUser: false };

function duration(ms) {
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
}

export async function helpCommand(message) {
  if (!message.inGuild() || message.author.bot) return;

  const staffCommands = [];

  if (GIVE_ADMIN_IDS.includes(message.author.id)) {
    staffCommands.push("`!give @user <amount>` — Add currency to a player.");
  }

  if (ITEM_ADMIN_IDS.includes(message.author.id)) {
    staffCommands.push(
      "`!spawnitem @user <item-id> [quantity]` — Grant inventory items without charging currency."
    );
  }

  if (message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
    staffCommands.push(
      "`!remove @user <amount>` — Remove currency from a player.",
      "`!resetdungeon [@user]` — Clear dungeon entry cooldown; defaults to yourself.",
      "`!wipe` — Reset the server economy after confirmation."
    );
  }

  const difficulties = Object.keys(dungeonConfig.difficulties);
  const difficultyOptions = difficulties.join("|");
  const cooldowns = difficulties.map((key) => {
    const cooldown = dungeonConfig.difficulties[key].cooldownMs ?? dungeonConfig.cooldownMs;
    return `${key.charAt(0).toUpperCase() + key.slice(1)}: ${duration(cooldown)}`;
  }).join(" • ");

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
        name: "📜 Daily & Weekly Quests",
        value: [
          "`!quests` — View daily and weekly progress, rewards, and reset times.",
          "`!claimquest <quest-id>` — Claim a completed quest.",
          "`!claimquest all` — Collect every completed, unclaimed quest reward.",
          "Work, fishing, and dungeon clears advance quests. Claim before reset!",
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
        name: "⛏️ Gathering & Rare Components",
        value: [
          "`!mine` — Gather scrap; chance for a Starforged Core.",
          "`!scavenge` / `!scavange` — Search for materials and Royal Thread.",
          "`!hunt` — Gather enchanted fur; chance for a Moonlit Fang.",
          "`!gathering` — View all three independent cooldowns.",
          "Add `drops` to any activity to see its exact material/component odds.",
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
        name: "🛒 Shop, Inventory & Equipment",
        value: [
          "`!shop` — Browse equipment categories and item details.",
          "`!buy <name or item-id> [quantity]` — Search and review a purchase.",
          "`!inventory` — Browse gear/materials, equip items, lock copies, or preview sales.",
          "`!equip` — Open the equipment manager.",
          "`!equip <item-id> [serial-number]` — Equip an owned copy.",
          "`!unequip <slot>` — Clear a slot, such as `main_hand`, `torso`, or `ring`.",
          "`!unequip <item-id> <serial-number>` — Unequip a specific copy.",
          "`!sell <item-id> <serial-number>` — Sell a sellable, unlocked item.",
          "`!special [weapon or skill]` — Browse or search weapon special attacks.",
        ].join("\n"),
      },
      {
        name: "🏰 Dungeons",
        value: [
          `\`!dungeon solo [${difficultyOptions}]\` — Start a solo run.`,
          `\`!dungeon @user [${difficultyOptions}]\` — Invite a partner.`,
          "`!dungeon` — Resume your dungeon.",
          "`!dungeon rewards` — Find an unclaimed reward.",
          "`!dungeon loot [difficulty]` — View current gear/material drop odds.",
          "`!dungeon roster [difficulty]` — Preview the rotating enemy lineup.",
          "`!dungeon mechanics` — Learn boss warnings and counters.",
          "Clear three rooms for currency and one loot roll per player.",
          `**Entry cooldowns:** ${cooldowns}.`,
          "Easy / Normal / Hard share a regular timer. Ultra / Nightmare share a separate raid timer.",
        ].join("\n"),
      },
      {
        name: "🤺 Player Combat",
        value: "`!duel @user <wager>` — Challenge a player to a wagered duel.",
      },
    ],
    [
      {
        name: "🔨 Crafting, Materials & Salvaging",
        value: [
          "`!craft` — Open the supplies, attachments, reinforcement and salvage browser.",
          "`!craft <supply-id> [quantity]` — Open a supply recipe; craft up to 10 at once.",
          "`!craft <attachment-id> [base-serial]` — Choose a base copy and review its upgrade.",
          "`!upgrade [item-id] [serial-number]` — Browse reinforcement up to +3.",
          "`!prepare [supply-id|clear]` — Prepare one crafted supply for your next dungeon.",
          "`!salvage [item-id] [serial-number]` — Browse gear to salvage, with confirmation.",
          "**Eternal upgrade:** Millie's Wrath + Eternal Cosmic Cat Orb → Millie's Eternal Wrath.",
          "Example: `!craft millies-eternal-wrath 1`.",
          "Materials are inventory-only items. Unequip and unlock ingredients before consuming them.",
        ].join("\n"),
      },
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

  const titles = [
    "🐱 Millie's Guide • Economy & Adventures",
    "🐱 Millie's Guide • Crafting, Cards, Pets & Staff",
  ];
  pages[0].push({ name: "🌌 Raid & Crafting Updates", value: [
    "`!dungeon cooldowns` — View separate regular and Ultra timers.",
    "`!dungeon solo ultra nightmare` — Harder Ultra; 2 guaranteed shards.",
    "Co-op: `!dungeon @user ultra nightmare`.",
    "Standard Ultra: 22 rounds per room; 1 guaranteed shard per clear.",
    "`!craft` → Raid Components — Exchange shards for rare components.",
    "`!upgrade` — Armor reinforcement now also adds HP.",
  ].join("\n") });

  let currentPage = 0;
  const previousId = `help:${message.id}:previous`;
  const nextId = `help:${message.id}:next`;

  function buildEmbed() {
    return new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle(titles[currentPage])
      .setDescription("`<argument>` means required • `[argument]` means optional")
      .addFields(...pages[currentPage])
      .setFooter({ text: `Page ${currentPage + 1}/${pages.length} • Controls expire after 2 minutes` });
  }

  function buildButtons(expired = false) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(previousId).setLabel("Previous")
        .setStyle(ButtonStyle.Primary).setDisabled(expired || currentPage === 0),
      new ButtonBuilder().setCustomId(nextId).setLabel("Next")
        .setStyle(ButtonStyle.Primary).setDisabled(expired || currentPage === pages.length - 1)
    );
  }

  const reply = await message.reply({
    embeds: [buildEmbed()], components: [buildButtons()], allowedMentions: quiet,
  });
  const collector = reply.createMessageComponentCollector({
    filter: interaction => interaction.isButton() && [previousId, nextId].includes(interaction.customId),
    time: 120_000,
  });

  let updates = Promise.resolve();
  collector.on("collect", async interaction => {
    if (interaction.user.id !== message.author.id) {
      await interaction.reply({
        content: "These controls belong to another player. Use !help.",
        flags: MessageFlags.Ephemeral, allowedMentions: quiet,
      }).catch(console.error);
      return;
    }

    // Queue in click order while acknowledging immediately.
    const acknowledged = interaction.deferUpdate().then(() => true, error => {
      console.error("Help interaction failed:", error);
      return false;
    });
    updates = updates.then(async () => {
      if (!await acknowledged || collector.ended) return;
      currentPage = Math.max(0, Math.min(pages.length - 1,
        currentPage + (interaction.customId === nextId ? 1 : -1)));
      await reply.edit({
        embeds: [buildEmbed()], components: [buildButtons(collector.ended)], allowedMentions: quiet,
      });
    }).catch(error => console.error("Help pagination failed:", error));
  });

  collector.on("end", () => {
    void updates.then(() => reply.edit({ components: [buildButtons(true)] }))
      .catch(error => console.error("Could not disable help buttons:", error));
  });
}
