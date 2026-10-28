const API = "https://api.tcgdex.net/v2/en";

export async function fetchJson(path, fetcher = fetch) {
  let lastError;
  for (let attempt=0; attempt<3; attempt++) {
    try {
      const response = await fetcher(`${API}/${path}`, {signal: AbortSignal.timeout(20_000)});
      if (!response.ok) throw new Error(`TCGdex returned HTTP ${response.status} for ${path}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt<2) await new Promise((resolve)=>setTimeout(resolve,300*(attempt+1)));
    }
  }
  throw lastError;
}

export async function fetchCard(id) {
  return fetchJson(`cards/${encodeURIComponent(id)}`);
}

export async function fetchSetCards(setId, onProgress = () => {}) {
  const set = await fetchJson(`sets/${encodeURIComponent(setId)}`);
  if (!Array.isArray(set.cards) || !set.cards.length) throw new Error(`No cards for ${setId}.`);
  const cards=[];
  // Small sequential requests avoid hammering the upstream service.
  for (const brief of set.cards) {
    const card = await fetchCard(brief.id);
    if (card.id !== brief.id || card.set?.id !== setId || !card.name || !card.rarity) {
      throw new Error(`Incomplete/mismatched metadata for ${brief.id}; previous catalog kept.`);
    }
    cards.push(card);
    onProgress(cards.length,set.cards.length);
  }
  return cards;
}
