import { economyConfig } from "../config/economy.js";
import { getBalance } from "../database/accounts.js";

export async function balanceCommand(message) {
  const balance = getBalance(message.guildId, message.author.id);

  await message.reply(
    `${economyConfig.currencyEmoji} You have **${balance.toLocaleString("en-US")} ${economyConfig.currencyName}**!`
  );
}
