export const CURRENCY_PER_USD = 100;
export const SELL_BACK_RATIO = 0.5;

// Optional manual USD prices for sets without an unambiguous loose booster.
// Values are USD, not bot currency. Manual entries take precedence over the feed.
export const USD_OVERRIDES = {
  // base1: 1000,
};

// Optional exact TCGCSV/TCGplayer group IDs for ambiguous set-name matches.
export const GROUP_OVERRIDES = {};

// Ordinary English loose booster products, not boxes or graded/1st-edition packs.
export const PRODUCT_OVERRIDES = {
  base1: 138130,
  swsh3: 216852,
  sv06: 543843,
};

// Initial references used only until a price sync supplies a market price.
// These are historical references, NOT claims of today's live prices.
export const REFERENCE_PRICES = {
  base1: {
    usd: 916.46, observedOn: "2026-10-28",
    productName: "Base Set Booster Pack [Revised Unlimited Edition]",
    source: "https://www.pallet.club/leaderboard/set/604-base-set",
  },
  swsh3: {
    usd: 10.06, observedOn: "2026-10-27",
    productName: "Darkness Ablaze Booster Pack",
    source: "https://www.pallet.club/leaderboard/product/216852-darkness-ablaze-booster-pack",
  },
  sv06: {
    usd: 9.47, observedOn: "2026-10-29",
    productName: "Twilight Masquerade Booster Pack",
    source: "https://pokevizinvestor.com/twm/sealed/twilight-masquerade-booster-pack",
  },
};
