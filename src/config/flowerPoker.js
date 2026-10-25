// Independent of your existing economyConfig (currency name and emoji).
export const flowerPokerConfig = {
  invitationMs: 60_000,
  plantingMs: 60_000,
  maxWager: 1_000_000,
};

// We normalize these reciprocal odds when drawing. Each flower can repeat.
// Server emojis with the specified names replace the fallback color markers.
export const flowers = [
  { id: "mixed", label: "Mixed", denominator: 10.1, emojiName: "fp_mixed", fallback: "🌈", file: "Mixed_flowers.png" },
  { id: "red", label: "Red", denominator: 6.673, emojiName: "fp_red", fallback: "🔴", file: "Red_flowers.png" },
  { id: "yellow", label: "Yellow", denominator: 6.673, emojiName: "fp_yellow", fallback: "🟡", file: "Yellow_flowers.png" },
  { id: "blue", label: "Blue", denominator: 6.673, emojiName: "fp_blue", fallback: "🔵", file: "Blue_flowers.png" },
  { id: "orange", label: "Orange", denominator: 6.673, emojiName: "fp_orange", fallback: "🟠", file: "Orange_flowers.png" },
  { id: "purple", label: "Purple", denominator: 6.673, emojiName: "fp_purple", fallback: "🟣", file: "Purple_flowers.png" },
  { id: "assorted", label: "Assorted", denominator: 6.673, emojiName: "fp_assorted", fallback: "💐", file: "Assorted_flowers.png" },
  { id: "black", label: "Black", denominator: 500.5, emojiName: "fp_black", fallback: "⚫", file: "Black_flowers.png" },
  { id: "white", label: "White", denominator: 1000.1, emojiName: "fp_white", fallback: "⚪", file: "White_flowers.png" },
];
