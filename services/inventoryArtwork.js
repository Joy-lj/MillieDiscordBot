import sharp from "sharp";
import { itemIcon, rarityIcon } from "./equipmentArtwork.js";

const xml = (value) =>
  String(value ?? "").replace(
    /[<>&"']/g,
    (char) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[char]
  );

const short = (value, max = 25) => {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

  return text.length > max
    ? text.slice(0, max - 1) + "…"
    : text;
};

const rarityName = (value) =>
  String(value ?? "common").replace(/_/g, " ");

async function safeGem(rarity, size) {
  try {
    return await rarityIcon(rarity, size);
  } catch (error) {
    console.error(
      "Inventory rarity image unavailable:",
      error.message
    );

    return null;
  }
}

async function safeItem(itemId) {
  try {
    return await itemIcon(itemId);
  } catch (error) {
    console.error(
      "Inventory item image unavailable:",
      error.message
    );

    return null;
  }
}

// Ten grouped item types per page.
export async function renderInventoryPage(
  groups,
  equippedIds = new Set()
) {
  if (!Array.isArray(groups) || groups.length > 10) {
    throw new Error("Use up to ten inventory types per page.");
  }

  if (!groups.length) return null;

  const width = 640;
  const height = 16 + Math.ceil(groups.length / 2) * 74;

  let svg = `
    <svg xmlns="http://www.w3.org/2000/svg"
         width="${width}"
         height="${height}">
      <rect width="${width}"
            height="${height}"
            rx="14"
            fill="#211e19"/>
  `;

  const overlays = [];

  for (let index = 0; index < groups.length; index++) {
    const group = groups[index];
    const item = group.item;

    const x = 10 + (index % 2) * 315;
    const y = 10 + Math.floor(index / 2) * 74;

    const rarity = item?.dungeon?.rarity ?? "common";

    const locked = group.copies.filter(
      (copy) => copy.is_locked
    ).length;

    const equipped = group.copies.filter(
      (copy) => equippedIds.has(String(copy.id))
    ).length;

    const flags = [
      equipped ? `${equipped} equipped` : "",
      locked ? `${locked} locked` : "",
    ]
      .filter(Boolean)
      .join(" · ");

    const name = short(item?.name ?? group.id);
    const quantity = group.copies.length.toLocaleString("en-US");

    const rarityLabel = short(
      item ? rarityName(rarity) : "Unknown item",
      32
    );

    svg += `
      <rect x="${x}" y="${y}"
            width="305" height="66"
            rx="9"
            fill="#302c24"
            stroke="#5c5240"/>

      <rect x="${x + 6}" y="${y + 6}"
            width="54" height="54"
            rx="7"
            fill="#211e19"/>

      <text x="${x + 70}" y="${y + 22}"
            fill="#f1e6cf"
            font-family="sans-serif"
            font-size="13"
            font-weight="bold">
        ${xml(name)}
      </text>

      <text x="${x + 70}" y="${y + 40}"
            fill="#cdbd9c"
            font-family="sans-serif"
            font-size="11">
        ×${xml(quantity)} · ${xml(rarityLabel)}
      </text>

      <text x="${x + 70}" y="${y + 55}"
            fill="#aaa08c"
            font-family="sans-serif"
            font-size="10">
        ${xml(flags)}
      </text>
    `;

    const artwork = await safeItem(group.id);

    if (artwork) {
      const thumbnail = await sharp(artwork)
        .resize(52, 52, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();

      overlays.push({
        input: thumbnail,
        left: x + 7,
        top: y + 7,
      });
    } else {
      svg += `
        <text x="${x + 33}" y="${y + 39}"
              text-anchor="middle"
              fill="#baa98a"
              font-family="sans-serif"
              font-size="20">
          ?
        </text>
      `;
    }

    // Smaller rarity gem over the item's lower-right corner.
    const gem = item ? await safeGem(rarity, 20) : null;

    if (gem) {
      overlays.push({
        input: gem,
        left: x + 44,
        top: y + 41,
      });
    }
  }

  svg += "</svg>";

  return sharp(Buffer.from(svg))
    .composite(overlays)
    .png()
    .toBuffer();
}

export async function renderInventoryIcon(
  itemId,
  rarity = "common"
) {
  const item = await safeItem(itemId);
  const gem = await safeGem(rarity, item ? 30 : 64);

  if (!item && !gem) return null;

  const overlays = [];

  if (item) {
    overlays.push({
      input: item,
      left: 10,
      top: 10,
    });
  }

  // Smaller rarity gem over the item's lower-right corner.
  // if (gem) {
  //   overlays.push({
  //     input: gem,
  //     left: item ? 88 : 28,
  //     top: item ? 2 : 28,
  //   });
  // }

  return sharp({
    create: {
      width: 120,
      height: 120,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(overlays)
    .png()
    .toBuffer();
}