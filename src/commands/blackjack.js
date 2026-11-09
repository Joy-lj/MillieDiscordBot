import { randomInt } from "node:crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
} from "discord.js";

import {
  settleBet,
  increaseBetWager,
} from "../database/bets.js";

import { economyConfig } from "../config/economy.js";

const quiet = {
  parse: [],
  repliedUser: false,
};

function createDeck() {
  const suits = ["♠", "♥", "♦", "♣"];
  const ranks = [
    "A", "2", "3", "4", "5", "6", "7",
    "8", "9", "10", "J", "Q", "K",
  ];

  const deck = suits.flatMap((suit) =>
    ranks.map((rank) => ({
      label: `${rank}${suit}`,
      value: rank === "A" ? 11 : Number(rank) || 10,
    }))
  );

  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

function score(hand) {
  let total = hand.reduce(
    (sum, card) => sum + card.value,
    0
  );

  let aces = hand.filter(
    (card) => card.value === 11
  ).length;

  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }

  return total;
}

function showHand(cards) {
  return cards.map((card) => card.label).join(" ");
}

function canSplit(hands, index) {
  const hand = hands[index];

  return (
    hands.length === 1 &&
    hand.cards.length === 2 &&
    hand.cards[0].value === hand.cards[1].value
  );
}

function handPayout(
  hand,
  dealerScore,
  playerNatural,
  dealerNatural
) {
  const total = score(hand.cards);

  if (total > 21) return 0;

  if (playerNatural || dealerNatural) {
    if (playerNatural && dealerNatural) {
      return hand.wager;
    }

    // Round down because balances use whole currency.
    return playerNatural
      ? Math.floor(hand.wager * 2.5)
      : 0;
  }

  if (dealerScore > 21 || total > dealerScore) {
    return hand.wager * 2;
  }

  if (total === dealerScore) {
    return hand.wager;
  }

  return 0;
}

export async function blackjackGame(message, bet) {
  const deck = createDeck();
  const dealer = [deck.pop(), deck.pop()];

  const hands = [
    {
      cards: [deck.pop(), deck.pop()],
      wager: bet.wager,
      done: false,
      doubled: false,
    },
  ];

  const playerNatural = score(hands[0].cards) === 21;
  const dealerNatural = score(dealer) === 21;
  const natural = playerNatural || dealerNatural;

  const { currencyName, currencyEmoji } = economyConfig;

  const money = (amount) =>
    `${amount.toLocaleString("en-US")} ${currencyName}`;

  const prefix = `blackjack:${bet.id}`;
  const customId = (action) => `${prefix}:${action}`;

  const validIds = new Set(
    ["hit", "stand", "double", "split"].map(customId)
  );

  let currentHand = 0;
  let totalWager = bet.wager;
  let timedOut = false;
  let gameMessage;

  function advanceHand() {
    while (
      currentHand < hands.length &&
      (
        hands[currentHand].done ||
        score(hands[currentHand].cards) >= 21
      )
    ) {
      hands[currentHand].done = true;
      currentHand++;
    }
  }

  function controls() {
    const hand = hands[currentHand];

    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(customId("hit"))
        .setLabel("Hit")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(customId("stand"))
        .setLabel("Stand")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(customId("double"))
        .setLabel("Double")
        .setStyle(ButtonStyle.Success)
        .setDisabled(hand.cards.length !== 2),

      new ButtonBuilder()
        .setCustomId(customId("split"))
        .setLabel("Split")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!canSplit(hands, currentHand))
    );
  }

  function board(revealDealer = false) {
    const dealerDisplay = revealDealer
      ? `${showHand(dealer)} — **${score(dealer)}**`
      : `${dealer[0].label} 🂠`;

    const playerDisplay = hands.map((hand, index) => {
      const total = score(hand.cards);

      const active =
        !revealDealer &&
        !natural &&
        index === currentHand;

      const label = hands.length === 1
        ? "You"
        : `Hand ${index + 1}`;

      const status = total > 21
        ? " • BUST"
        : hand.doubled
          ? " • Doubled"
          : "";

      return (
        `${active ? "➡️ " : ""}**${label}:** ` +
        `${showHand(hand.cards)} — **${total}**${status}\n` +
        `Wager: **${money(hand.wager)}**`
      );
    }).join("\n\n");

    return (
      `🃏 **Blackjack — ${message.author.username}**\n` +
      `Total wager: **${money(totalWager)}**\n\n` +
      `${playerDisplay}\n\n` +
      `**Dealer:** ${dealerDisplay}`
    );
  }

  async function render() {
    await gameMessage.edit({
      content: board(),
      components:
        currentHand < hands.length
          ? [controls()]
          : [],
      allowedMentions: quiet,
    });
  }

  async function reserveExtra(amount, interaction) {
    const result = await increaseBetWager(
      bet.id,
      amount,
      totalWager
    );

    if (!result.success) {
      await interaction.followUp({
        content: result.error ?? "Could not increase the wager.",
        flags: MessageFlags.Ephemeral,
        allowedMentions: quiet,
      }).catch(console.error);

      return false;
    }

    totalWager = result.wager;
    return true;
  }

  try {
    gameMessage = await message.reply({
      content: board(),
      components: natural ? [] : [controls()],
      allowedMentions: quiet,
    });

    if (!natural) {
      while (currentHand < hands.length) {
        let interaction;

        try {
          interaction = await gameMessage.awaitMessageComponent({
            componentType: ComponentType.Button,
            filter: (click) =>
              click.user.id === message.author.id &&
              validIds.has(click.customId),
            time: 60_000,
          });
        } catch (error) {
          if (error.code !== "InteractionCollectorError") {
            throw error;
          }

          timedOut = true;

          for (const hand of hands) {
            hand.done = true;
          }

          break;
        }

        await interaction.deferUpdate();

        const hand = hands[currentHand];
        const action = interaction.customId.split(":").at(-1);

        if (action === "stand") {
          hand.done = true;
        } else if (action === "hit") {
          hand.cards.push(deck.pop());
        } else if (action === "double") {
          if (hand.cards.length !== 2) {
            await interaction.followUp({
              content: "You can only double a two-card hand.",
              flags: MessageFlags.Ephemeral,
            }).catch(console.error);

            continue;
          }

          if (!await reserveExtra(hand.wager, interaction)) {
            continue;
          }

          hand.wager *= 2;
          hand.doubled = true;
          hand.cards.push(deck.pop());
          hand.done = true;
        } else if (action === "split") {
          if (!canSplit(hands, currentHand)) {
            await interaction.followUp({
              content:
                "You can split once, using two cards of equal value.",
              flags: MessageFlags.Ephemeral,
            }).catch(console.error);

            continue;
          }

          if (!await reserveExtra(hand.wager, interaction)) {
            continue;
          }

          const [first, second] = hand.cards;
          const splitAces = first.value === 11;

          hand.cards = [first, deck.pop()];
          hand.done = splitAces;

          hands.push({
            cards: [second, deck.pop()],
            wager: hand.wager,
            done: splitAces,
            doubled: false,
          });
        }

        advanceHand();
        await render();
      }
    }

    // Dealer stands on all 17s, including soft 17.
    const hasLiveHand = hands.some(
      (hand) => score(hand.cards) <= 21
    );

    if (!natural && hasLiveHand) {
      while (score(dealer) < 17) {
        dealer.push(deck.pop());
      }
    }

    const dealerScore = score(dealer);

    const payouts = hands.map((hand) =>
      handPayout(
        hand,
        dealerScore,
        playerNatural,
        dealerNatural
      )
    );

    const payout = payouts.reduce(
      (sum, amount) => sum + amount,
      0
    );

    // Settle the whole game once, including every extra wager.
    const balance = await settleBet(bet.id, payout);

    if (balance == null) {
      await gameMessage.edit({
        content:
          `${board(true)}\n\n` +
          "This bet was already settled. Check `!balance`.",
        components: [],
        allowedMentions: quiet,
      }).catch(console.error);

      return;
    }

    const results = hands.map((hand, index) => {
      const returned = payouts[index];
      const total = score(hand.cards);

      let result;

      if (total > 21) {
        result = "❌ Busted";
      } else if (natural) {
        result = playerNatural && dealerNatural
          ? "🤝 Both have blackjack — push"
          : playerNatural
            ? "🎉 Natural blackjack — pays 3:2"
            : "❌ Dealer blackjack";
      } else if (returned > hand.wager) {
        result = dealerScore > 21
          ? "🎉 Dealer busted — you win"
          : "🎉 You win";
      } else if (returned === hand.wager) {
        result = "🤝 Push — wager returned";
      } else {
        result = "❌ Dealer wins";
      }

      const label = hands.length > 1
        ? `**Hand ${index + 1}:** `
        : "";

      return `${label}${result}`;
    }).join("\n");

    const profit = payout - totalWager;

    await gameMessage.edit({
      content:
        `${board(true)}\n\n` +
        (timedOut
          ? "⏳ Time expired: remaining hands automatically stood.\n"
          : "") +
        `${results}\n\n` +
        `Returned: **${money(payout)}**\n` +
        `Net: **${profit > 0 ? "+" : ""}${money(profit)}**\n` +
        `${currencyEmoji} Balance: **${money(balance)}**`,
      components: [],
      allowedMentions: quiet,
    }).catch((error) => {
      // Settlement already committed. Never pay or refund again here.
      console.error("Blackjack settled; result message failed:", error);
    });
  } catch (error) {
    console.error("Blackjack game failed:", error);

    const data = {
      content:
        "⚠️ Blackjack stopped because of an error. " +
        "Your wager may still be reserved. " +
        "Check your balance and ask an administrator to review the bot log.",
      components: [],
      allowedMentions: quiet,
    };

    // Do not automatically retry a possibly committed database operation.
    if (gameMessage) {
      await gameMessage.edit(data).catch(console.error);
    } else {
      await message.reply(data).catch(console.error);
    }
  }
}