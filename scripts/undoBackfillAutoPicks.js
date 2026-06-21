// Undoes scripts/backfillAutoPicks.js — deletes every prediction it wrote
// (anything flagged `backfilled: true`) and recomputes the leaderboard.
// Does NOT touch real player picks or the live, narrow auto-pick safety net
// inside syncMatches.js (those are never flagged `backfilled`).
//
// Run from the project root:  node scripts/undoBackfillAutoPicks.js
import { readFileSync } from "node:fs";
import admin from "firebase-admin";
import { recomputeLeaderboard } from "./recompute.js";

const sa = JSON.parse(readFileSync("./serviceAccount.json", "utf8"));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const snap = await db.collection("predictions").where("backfilled", "==", true).get();
console.log(`Found ${snap.size} backfilled prediction(s) to remove.`);

let batch = db.batch();
let n = 0;
for (const d of snap.docs) {
  const p = d.data();
  console.log(`  - ${p.displayName || p.uid} — ${p.matchId}`);
  batch.delete(d.ref);
  if (++n % 400 === 0) {
    await batch.commit();
    batch = db.batch();
  }
}
await batch.commit();
console.log(`Removed ${n} prediction(s).`);

console.log("Recomputing leaderboard…");
const players = await recomputeLeaderboard(db);
console.log(`Updated ${players} players.`);
process.exit(0);
