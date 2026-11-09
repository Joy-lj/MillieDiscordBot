import { getBalance } from "../database/accounts.js";

export async function resolveWager(
    message,
    amountText,
    maximum = 100_000_000
) {
    const input = String(amountText ?? "").trim().toLowerCase();

    if (input !== "all" && !/^\d+$/.test(input)) {
        return {
            error: 'Enter a positive whole-number wager or "all".',
        };
    }

    let wager;

    if (input === "all") {
        try {
            wager = Number(
                await getBalance(message.guildId, message.author.id)
            );
        } catch (error) {
            console.error("Could not load all-in balance:", error);

            return {
                error: "Couldn't check your balance. No bet was placed.",
            };
        }

        if (wager === 0) {
            return {
                error: "You don't have any currency to bet.",
            };
        }
    } else {
        wager = Number(input);
    }

    if (!Number.isSafeInteger(wager) || wager < 1) {
        return {
            error: "Your wager must be a positive whole number within the supported limit.",
        };
    }

    // Never silently reduce an all-in wager.
    if (wager > maximum) {
        return {
            error:
                `The maximum wager is ${maximum.toLocaleString("en-US")}. ` +
                (input === "all"
                    ? "Your full balance exceeds that limit. Enter a smaller amount."
                    : "Enter a smaller amount."),
        };
    }

    return {
        wager,
        allIn: input === "all",
    };
}