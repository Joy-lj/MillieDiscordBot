import {
    RARITY_EMOJIS,
    UNKNOWN_RARITY_EMOJI,
} from "../config/rarityEmoji.js";

export function rarityKey(value) {
    const key = String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_")
        .replace(/_+/g, "_");

    const aliases = {
        rare_holo: "holo_rare",
        other_rarities: "special",
        special_rarities: "special",
    };

    return Object.hasOwn(aliases, key)
        ? aliases[key]
        : key;
}

function configuredEmoji(rarity) {
    const key = rarityKey(rarity);

    const value = Object.hasOwn(RARITY_EMOJIS, key)
        ? RARITY_EMOJIS[key]
        : UNKNOWN_RARITY_EMOJI;

    return typeof value === "string" && value.trim()
        ? value.trim()
        : UNKNOWN_RARITY_EMOJI;
}

export function rarityEmoji(rarity) {
    return configuredEmoji(rarity);
}

export function rarityOptionEmoji(rarity) {
    const value = configuredEmoji(rarity);

    const match = value.match(
        /^<(a?):([A-Za-z0-9_]{2,32}):(\d{17,25})>$/
    );

    if (match) {
        return {
            id: match[3],
            name: match[2],
            animated: match[1] === "a",
        };
    }

    if (value.startsWith("<") || /^\d+$/.test(value)) {
        return { name: UNKNOWN_RARITY_EMOJI };
    }

    return { name: value };
}