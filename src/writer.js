/**
 * writer.js
 *
 * Writes market data snapshots to Firestore.
 * Has NO HTTP/fetch dependency — pure Firestore-writing logic.
 * Connects directly to the specific named Firestore database instance:
 * ai-studio-solanamemecointr-e8d74d6f-bad5-479c-b097-fb16e4279ca1
 *
 * Exported function:
 *   writeToFirestore(data) → Promise<void>
 *
 * @typedef {{
 *   mint:         string,
 *   symbol:       string,
 *   name:         string,
 *   price:        number | null,
 *   volume24h:    number | null,
 *   liquidity:    number | null,
 *   organicScore: number | null,
 *   source:       string,
 * }} TokenMarketData
 */

'use strict';

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_DATABASE_ID } from './config.js';

// ---------------------------------------------------------------------------
// Firebase Admin initialisation (idempotent — safe to import multiple times)
// ---------------------------------------------------------------------------

let _db = null;

function normalizePrivateKey(key) {
  if (!key) return key;
  let str = String(key).replace(/\\n/g, '\n').replace(/\r/g, '');
  const header = '-----BEGIN PRIVATE KEY-----';
  const footer = '-----END PRIVATE KEY-----';
  if (str.includes(header) && str.includes(footer)) {
    const body = str
      .substring(str.indexOf(header) + header.length, str.indexOf(footer))
      .replace(/\s+/g, '');
    const lines = body.match(/.{1,64}/g) || [];
    return header + '\n' + lines.join('\n') + '\n' + footer + '\n';
  }
  return str;
}

function getDb() {
  if (_db) return _db;

  if (getApps().length === 0) {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON);
      if (serviceAccount.private_key) {
        serviceAccount.private_key = normalizePrivateKey(serviceAccount.private_key);
      }
    } catch (err) {
      throw new Error(
        `[writer] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON. ` +
          `Make sure the env var contains the raw JSON string (not a file path).\n${err.message}`
      );
    }

    initializeApp({ credential: cert(serviceAccount) });
    console.log('[writer] Firebase Admin initialised.');
  }

  // Target the specific named Firestore database instance
  _db = getFirestore(FIREBASE_DATABASE_ID);
  return _db;
}

// ---------------------------------------------------------------------------
// Firestore schema
//
// Collection: market_data
// Document ID: mint address
// Fields: symbol, name, price, volume24h, liquidity, organicScore,
//         updatedAt (server timestamp), source
// ---------------------------------------------------------------------------

const COLLECTION = 'market_data';

/**
 * Upserts all token market data records into Firestore using a batch write.
 * Each document is identified by the token's mint address.
 *
 * @param {TokenMarketData[]} data
 * @returns {Promise<void>}
 */
export async function writeToFirestore(data) {
  if (!data || data.length === 0) {
    console.warn('[writer] writeToFirestore called with empty data — skipping.');
    return;
  }

  const db = getDb();
  const batch = db.batch();

  for (const token of data) {
    const docRef = db.collection(COLLECTION).doc(token.mint);
    batch.set(docRef, {
      symbol:       token.symbol,
      name:         token.name,
      price:        token.price,
      volume24h:    token.volume24h,
      liquidity:    token.liquidity,
      organicScore: token.organicScore,
      source:       token.source,
      updatedAt:    FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
  console.log(`[writer] Committed ${data.length} documents to Firestore/${COLLECTION}.`);
}
