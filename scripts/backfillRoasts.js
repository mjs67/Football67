// Backfills per-league AND global roasts for every already-finished match
// in Firestore — not just whatever's inside scripts/syncMatches.js's rolling
// sync window (now ± DAYS_AHEAD).
//
// Why this exists: syncMatches.js only ever calls the roast generators on
// matches in `data.matches`, the football-data.org response for THAT run,
// filtered to the rolling window. Once a finished match ages out of that
// window, it stops being reprocessed entirely. That's invisible for
// existing leagues that already got their roast while the match was still
// fresh — but it means:
//   - A league created AFTER a match aged out of the window never gets a
//     roast for that match, even though members have predictions on it.
//   - The globalRoasts feed (new) has never run for any match older than
//     "still inside the window on the day this code first deployed".
//
// Both roast generators are idempotent (skip if a doc already exists for
// that match), so this is safe to re-run any time — it only fills gaps.
//
// Usage:
//   node scripts/backfillRoasts.js
import { readFileSync, existsSync } from "node:fs";
import admin from "firebase-admin";
import { generateRoastsForLeagues, generateGlobalRoast } from "./roastGeneration.js";

if (existsSync("./serviceAccount.json")) {
  const sa = JSON.parse(readFileSync("./serviceAccount.json", "utf8"));
  admin.initializeApp({ credential: admin.credential.cert(sa) });
} else {
  admin.initializeApp(); // uses GOOGLE_APPLICATION_CREDENTIALS
}
const db = admin.firestore();

const finishedSnap = await db.collection("matches").where("status", "==", "finished").get();
console.log(`Found ${finishedSnap.size} finished matches in Firestore.`);

let processed = 0;
for (const matchDoc of finishedSnap.docs) {
  const m = matchDoc.data();
  if (m.homeScore == null || m.awayScore == null) {
    console.log(`  ⚠ Skipping ${matchDoc.id} — marked finished but missing a score.`);
    continue;
  }
  const matchName = `${m.home} v ${m.away}`;
  const finalScore = `${m.homeScore}-${m.awayScore}`;
  await generateRoastsForLeagues(db, matchDoc.id, matchName, finalScore);
  await generateGlobalRoast(db, matchDoc.id, matchName, finalScore);
  processed++;
}

console.log(`Backfill complete — checked ${processed} finished matches (existing roasts left untouched).`);
process.exit(0);
