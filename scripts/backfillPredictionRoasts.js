// One-off: generate v2 per-prediction roasts (§5.1–5.3) for EVERY already
// finished match — the matches that settled before generatePredictionRoasts
// existed in the sync. Safe to re-run: roast docs are keyed {uid}_{matchId}
// and community state (reactions/shareCount/createdAt) is preserved.
//
// Run:  node scripts/backfillPredictionRoasts.js
import { db } from "./admin.js";
import { buildRoastContext, generatePredictionRoasts } from "./roastGeneration.js";

const ctx = await buildRoastContext(db);

const finished = await db.collection("matches").where("status", "==", "finished").get();
console.log(`Backfilling v2 roasts across ${finished.size} finished match(es)…`);

let matchesDone = 0;
for (const mDoc of finished.docs) {
  const m = mDoc.data();
  const matchId = mDoc.id;
  const matchName = `${m.home} v ${m.away}`;
  if (m.homeScore == null || m.awayScore == null) continue;
  const finalScore = `${m.homeScore}-${m.awayScore}`;

  const predsSnap = await db.collection("predictions").where("matchId", "==", matchId).get();
  const preds = predsSnap.docs.map((d) => d.data());
  if (preds.length === 0) continue;

  await generatePredictionRoasts(db, ctx, matchId, matchName, finalScore, preds);
  matchesDone++;
}

console.log(`Done. Processed ${matchesDone} match(es) with predictions.`);
process.exit(0);
