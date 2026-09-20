/**
 * fetcher.js
 *
 * Fetches live market data for a given list of tokens from Jupiter APIs.
 * Has NO Firestore dependency — pure data-fetching logic.
 *
 * Exported function:
 *   fetchMarketData(watchlist) → Promise<TokenMarketData[]>
 *
 * TokenMarketData shape:
 *   {
 *     mint:         string,
 *     symbol:       string,
 *     name:         string,
 *     price:        number | null,   // USD
 *     volume24h:    number | null,   // USD 24-hour total volume
 *     liquidity:    number | null,   // USD liquidity
 *     organicScore: number | null,   // 0-100 authenticity score
 *     source:       'jupiter',
 *   }
 */

'use strict';

import {
  JUPITER_API_KEY,
  JUPITER_PRICE_V3_URL,
  JUPITER_TOKENS_V2_URL,
  TOKENS_REQUEST_DELAY_MS,
} from './config.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pause for `ms` milliseconds. Used to space out sequential API calls. */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Shared fetch wrapper with error handling.
 * Throws a descriptive Error on non-2xx responses so the caller can catch it.
 */
async function apiFetch(url, label) {
  const response = await fetch(url, {
    headers: {
      'x-api-key': JUPITER_API_KEY,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '(no body)');
    throw new Error(
      `[fetcher] ${label} → HTTP ${response.status} from ${url}\n${body}`
    );
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Step 1 — Batch price fetch (all mints in one request)
// ---------------------------------------------------------------------------

/**
 * Fetches USD prices for all mints in a single Jupiter Price V3 request.
 * @param {string[]} mints
 * @returns {Promise<Record<string, number | null>>} mint → price
 */
async function fetchPrices(mints) {
  const ids = mints.join(',');
  const url = `${JUPITER_PRICE_V3_URL}?ids=${encodeURIComponent(ids)}`;
  const json = await apiFetch(url, 'Price V3');

  // Response shape: { data: { <mint>: { id, price, ... } }, ... }
  const prices = {};
  for (const mint of mints) {
    const entry = json?.[mint];
    prices[mint] = entry?.usdPrice != null ? Number(entry.usdPrice) : null;
  }
  return prices;
}

// ---------------------------------------------------------------------------
// Step 2 — Per-token Tokens V2 fetch (volume, liquidity, organicScore)
// ---------------------------------------------------------------------------

/**
 * Fetches extended token stats for a single mint from Jupiter Tokens V2.
 * Returns null fields if the token isn't found or the API call fails.
 *
 * @param {string} mint
 * @returns {Promise<{ volume24h: number|null, liquidity: number|null, organicScore: number|null }>}
 */
async function fetchTokenStats(mint) {
  const url = `${JUPITER_TOKENS_V2_URL}?query=${encodeURIComponent(mint)}`;

  let json;
  try {
    json = await apiFetch(url, `Tokens V2 (${mint.slice(0, 8)}…)`);
  } catch (err) {
    console.warn(`[fetcher] Tokens V2 call failed for ${mint}: ${err.message}`);
    return { volume24h: null, liquidity: null, organicScore: null };
  }

  // Response is an array of token objects; pick the one matching our mint exactly.
  const tokens = Array.isArray(json) ? json : json?.tokens ?? [];
  const token = tokens.find((t) => t.id === mint || t.mint === mint || t.address === mint);

  if (!token) {
    console.warn(`[fetcher] Tokens V2: no exact match for mint ${mint}`);
    return { volume24h: null, liquidity: null, organicScore: null };
  }

  // Field names vary across Jupiter API versions — check common shapes.
  const stats24h = token.stats24h ?? token.stats?.['24h'] ?? {};
  const volume24h =
    token.volume24h ??
    token.v24hUSD ??
    (stats24h.buyVolume != null && stats24h.sellVolume != null
      ? stats24h.buyVolume + stats24h.sellVolume
      : null);

  const liquidity = token.liquidity ?? token.tvl ?? null;
  const organicScore = token.organicScore ?? null;

  return {
    volume24h: volume24h != null ? Number(volume24h) : null,
    liquidity: liquidity != null ? Number(liquidity) : null,
    organicScore: organicScore != null ? Number(organicScore) : null,
  };
}

// ---------------------------------------------------------------------------
// Main exported function
// ---------------------------------------------------------------------------

/**
 * Fetches market data for all tokens in the watchlist.
 *
 * @param {{ mint: string, symbol: string, name: string }[]} watchlist
 * @returns {Promise<import('./writer.js').TokenMarketData[]>}
 */
export async function fetchMarketData(watchlist) {
  const mints = watchlist.map((t) => t.mint);

  // ── Step 1: batch price fetch ────────────────────────────────────────────
  console.log(`[fetcher] Fetching prices for ${mints.length} tokens…`);
  let prices;
  try {
    prices = await fetchPrices(mints);
  } catch (err) {
    console.error(`[fetcher] Price V3 batch request failed: ${err.message}`);
    // Default all prices to null; individual stats may still succeed.
    prices = Object.fromEntries(mints.map((m) => [m, null]));
  }

  // ── Step 2: sequential Tokens V2 requests ───────────────────────────────
  const results = [];
  for (const token of watchlist) {
    if (results.length > 0) {
      // Small delay between requests to respect rate limits
      await sleep(TOKENS_REQUEST_DELAY_MS);
    }

    const stats = await fetchTokenStats(token.mint);

    results.push({
      mint: token.mint,
      symbol: token.symbol,
      name: token.name,
      price: prices[token.mint] ?? null,
      volume24h: stats.volume24h,
      liquidity: stats.liquidity,
      organicScore: stats.organicScore,
      source: 'jupiter',
    });
  }

  return results;
}
