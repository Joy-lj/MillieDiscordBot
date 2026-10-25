import { randomInt } from "node:crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";

import { settleBet } from "../database/bets.js";
import { economyConfig } from "../config/economy.js";

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

  // Shuffle a standard 52-card deck.
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

function score(hand) {
  let total = hand.reduce((sum, card) => sum + card.value, 0);
  let aces = hand.filter((card) => card.value === 11).length;

  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }

  return total;
}

function showHand(hand) {
  return hand.map((card) => card.label).join(" ");
}

export async function blackjackGame(message, bet) {
  const deck = createDeck();
  const player = [deck.pop(), deck.pop()];
  const dealer = [deck.pop(), deck.pop()];

  const { currencyName, currencyEmoji } = economyConfig;

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("blackjack_hit")
      .setLabel("Hit")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("blackjack_stand")
      .setLabel("Stand")
      .setStyle(ButtonStyle.Secondary)
  );
  function board(revealDealer = false) {
    const dealerDisplay = revealDealer
      ? `${showHand(dealer)} — **${score(dealer)}**`
      : `${dealer[0].label} 🂠`;

    return (
      `🃏 **Blackjack — ${message.author.username}**\n` +
      `Bet: **${bet.wager.toLocaleString("en-US")} ${currencyName}**\n\n` +
      `**You:** ${showHand(player)} — **${score(player)}**\n` +
      `**Dealer:** ${dealerDisplay}`
    );
  }

  const natural = score(player) === 21 || score(dealer) === 21;

  const gameMessage = await message.reply({
    content: board(),
    components: natural ? [] : [buttons],
    allowedMentions: { parse: [], repliedUser: false },
  });

  let timedOut = false;

  // Natural blackjacks resolve immediately.
  if (!natural) {
    while (score(player) < 21) {
      let interaction;

      try {
        interaction = await gameMessage.awaitMessageComponent({
          componentType: ComponentType.Button,
          filter: (click) => click.user.id === message.author.id,
          time: 60_000,
        });
      } catch (error) {
        if (error.code !== "InteractionCollectorError") throw error;

        timedOut = true;
        break;
      }

      await interaction.deferUpdate();

      if (interaction.customId === "blackjack_stand") break;

      player.push(deck.pop());

      if (score(player) >= 21) break;

      await gameMessage.edit({
        content: board(),
        components: [buttons],
      });
    }
  }  
// Dealer only draws if the player hasn't busted
  // and neither opening hand was a natural blackjack.
  if (!natural && score(player) <= 21) {
    while (score(dealer) < 17) {
      dealer.push(deck.pop());
    }
  }

  const playerScore = score(player);
  const dealerScore = score(dealer);
  let payout = 0;
  let result;

  if (playerScore > 21) {
    result = "❌ You busted!";
  } else if (natural) {
    if (playerScore === 21 && dealerScore === 21) {   
      payout = bet.wager;
      result = "🤝 Both have blackjack! Your wager was refunded.";
    } else if (playerScore === 21) {
      payout = bet.wager * 2.5;
      result = "🎉 Natural blackjack! You win at 3:2!";
    } else {
      result = "❌ Dealer has blackjack!";
    }
  } else if (dealerScore > 21 || playerScore > dealerScore) {
    payout = bet.wager * 2;
    result = dealerScore > 21 ? "🎉 Dealer busted! You win!" : "🎉 You win!";
  } else if (playerScore === dealerScore) {
    payout = bet.wager;
    result = "🤝 Tie! Your wager was refunded.";
  } else {
    result = "❌ Dealer wins!";
  }

  const balance = settleBet(bet.id, payout);

  await gameMessage.edit({
    content:
      `${board(true)}\n\n` +
      (timedOut ? "⏳ Time expired: automatically stood.\n" : "") +
      `${result}\n` +
      `Returned: **${payout.toLocaleString("en-US")} ${currencyName}**\n` +
      `${currencyEmoji} Balance: **${balance.toLocaleString("en-US")} ${currencyName}**`,
    components: [],
  });
}