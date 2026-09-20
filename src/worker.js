/**
 * worker.js  ←  entry point
 *
 * Orchestrates the polling loop:
 *   1. On start: run one poll immediately so you can see data right away.
 *   2. Repeat every POLL_INTERVAL_MS milliseconds forever.
 *   3. Per-run errors are caught and logged — the loop continues regardless.
 *
 * Start with:
 *   node src/worker.js
 *
 * Required env vars (see .env.example):
 *   JUPITER_API_KEY
 *   FIREBASE_SERVICE_ACCOUNT_JSON
 */

'use strict';


import { WATCHLIST, POLL_INTERVAL_MS } from './config.js';
import { fetchMarketData } from './fetcher.js';
import { writeToFirestore } from './writer.js';


// ---------------------------------------------------------------------------
// Single poll cycle
// ---------------------------------------------------------------------------

let pollCount = 0;

async function runOnce() {
  pollCount++;
  const label = `Poll #${pollCount}`;
  const start = Date.now();
  console.log(`\n[worker] ── ${label} starting (${new Date().toISOString()}) ──`);

  try {
    const data = await fetchMarketData(WATCHLIST);

    // Log a quick summary before writing
    for (const t of data) {
      const price = t.price != null ? `$${t.price.toFixed(4)}` : 'null';
      const vol = t.volume24h != null ? `$${(t.volume24h / 1e6).toFixed(2)}M` : 'null';
      const liq = t.liquidity != null ? `$${(t.liquidity / 1e6).toFixed(2)}M` : 'null';
      console.log(
        `[worker]   ${t.symbol.padEnd(6)} price=${price.padStart(12)}  vol24h=${vol.padStart(10)}  liq=${liq.padStart(10)}`
      );
    }

    await writeToFirestore(data);

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[worker] ── ${label} complete in ${elapsed}s — next in ${POLL_INTERVAL_MS / 1000}s ──`);
  } catch (err) {
    // Log the error but do NOT rethrow — the interval keeps running.
    console.error(`[worker] ── ${label} FAILED: ${err.message}`);
    if (err.stack) console.error(err.stack);
  }
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

console.log('[worker] Starting up…');
console.log(`[worker] Watchlist: ${WATCHLIST.map((t) => t.symbol).join(', ')}`);
console.log(`[worker] Poll interval: ${POLL_INTERVAL_MS / 1000}s`);

// Run immediately, then on a fixed interval.
// Using a recursive setTimeout rather than setInterval so overlapping polls
// are impossible (a slow poll won't stack up behind a fast interval).
async function scheduleNext() {
  await runOnce();
  setTimeout(scheduleNext, POLL_INTERVAL_MS);
}

scheduleNext().catch((err) => {
  // Only reaches here if the very first poll throws synchronously (e.g. bad config).
  console.error('[worker] Fatal startup error:', err.message);
  process.exit(1);
});
