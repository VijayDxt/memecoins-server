/**
 * config.js
 *
 * Centralises:
 *  - the token watchlist
 *  - environment-variable reading & validation
 *  - shared constants
 *
 * Throws at startup if any required env var is missing so failures are
 * loud and immediate rather than hidden inside a later async call.
 */

'use strict';

// ---------------------------------------------------------------------------
// Watchlist — edit this array to change which tokens are tracked.
// Each entry needs a mint address; symbol/name are stored alongside the
// market data in Firestore for human readability.
// ---------------------------------------------------------------------------
export const WATCHLIST = [
  {
    mint: 'So11111111111111111111111111111111111111112',
    symbol: 'SOL',
    name: 'Wrapped SOL',
  },
  {
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    symbol: 'USDC',
    name: 'USD Coin',
  },
  {
    mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    symbol: 'BONK',
    name: 'Bonk',
  },
  {
    mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
    symbol: 'WIF',
    name: 'dogwifhat',
  },
  {
    mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    symbol: 'JUP',
    name: 'Jupiter',
  },
];

// ---------------------------------------------------------------------------
// Environment-variable validation
// ---------------------------------------------------------------------------
function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}\n` +
        `Copy .env.example to .env and fill in the value, or set it on your host.`
    );
  }
  return value;
}

// Required
export const JUPITER_API_KEY = requireEnv('JUPITER_API_KEY');
export const FIREBASE_SERVICE_ACCOUNT_JSON = requireEnv('FIREBASE_SERVICE_ACCOUNT_JSON');
export const FIREBASE_DATABASE_ID = process.env.FIREBASE_DATABASE_ID ?? 'ai-studio-solanamemecointr-e8d74d6f-bad5-479c-b097-fb16e4279ca1';

// Optional (reserved for future passes — not called in this pass)
export const HELIUS_API_KEY = process.env.HELIUS_API_KEY ?? null;

// Poll interval — defaults to 20 seconds
export const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? '20000', 10);

// ---------------------------------------------------------------------------
// Jupiter API endpoints
// ---------------------------------------------------------------------------
export const JUPITER_PRICE_V3_URL = 'https://api.jup.ag/price/v3';
export const JUPITER_TOKENS_V2_URL = 'https://api.jup.ag/tokens/v2/search';

// Delay between sequential Tokens V2 requests (ms) to stay within rate limits
export const TOKENS_REQUEST_DELAY_MS = 300;
