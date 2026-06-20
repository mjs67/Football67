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
// By default this only FILLS GAPS (existing roasts are left untouched) —
// safe to re-run any time. Pass --force to instead REGENERATE every roast,
// overwriting existing ones. Use --force once after fixing a bug in the
// targeting logic itself (pickRoastTarget in roastGeneration.js) — without
// it, roasts already written under the old logic stay wrong forever, since
// normal runs (and a plain backfill) skip anything that already exists.
// --force preserves each roast's original generatedAt so the homepage's
// "most recent roast" ordering doesn't get scrambled — only the content
// (target/text) is recomputed.
//
// Usage:
//   node scripts/backfillRoasts.js            (fill gaps only)
//   node scripts/backfillRoasts.js --force    (regenerate everything)
import { readFileSync, existsSync } from "node:fs";
import admin from "firebase-admin";
import { generateRoastsForLeagues, generateGlobalRoast, buildRoastContext } from "./roastGeneration.js";

if (existsSync("./serviceAccount.json")) {
  const sa = JSON.parse(readFileSync("./serviceAccount.json", "utf8"));
  admin.initializeApp({ credential: admin.credential.cert(sa) });
} else {
  admin.initializeApp(); // uses GOOGLE_APPLICATION_CREDENTIALS
}
const db = admin.firestore();

const FORCE = process.argv.includes("--force");
console.log(
  FORCE
    ? "Force mode — regenerating EVERY roast (existing ones will be overwritten)."
    : "Gap-fill mode — only generating roasts that don't exist yet (pass --force to regenerate everything)."
);

const finishedSnap = await db.collection("matches").where("status", "==", "finished").get();
console.log(`Found ${finishedSnap.size} finished matches in Firestore.`);

// Built once for the whole run — see roastGeneration.js for why this
// matters. Without it, this script alone can burn through Firestore's
// free-tier daily quota (50K reads/day) on a single run across enough
// matches and leagues.
let processed = 0;
try {
  const roastCtx = await buildRoastContext(db);
  console.log(`Context: ${roastCtx.leagues.length} league(s), ${roastCtx.usersByPoints.length} user(s).`);

  for (const matchDoc of finishedSnap.docs) {
    const m = matchDoc.data();
    if (m.homeScore == null || m.awayScore == null) {
      console.log(`  ⚠ Skipping ${matchDoc.id} — marked finished but missing a score.`);
      continue;
    }
    const matchName = `${m.home} v ${m.away}`;
    const finalScore = `${m.homeScore}-${m.awayScore}`;
    const predsSnap = await db.collection("predictions").where("matchId", "==", matchDoc.id).get();
    const preds = predsSnap.docs.map((d) => d.data());
    await generateRoastsForLeagues(db, roastCtx, matchDoc.id, matchName, finalScore, preds, { force: FORCE });
    await generateGlobalRoast(db, roastCtx, matchDoc.id, matchName, finalScore, preds, { force: FORCE });
    processed++;
  }

  console.log(`Backfill complete — checked ${processed} finished matches.`);
  process.exit(0);
} catch (err) {
  // Most likely cause: Firestore's daily free-tier quota ran out mid-run.
  // Whatever was already written before this point is still in Firestore —
  // nothing rolls back — but the run is genuinely incomplete, so this exits
  // non-zero (unlike syncMatches.js, there's no recomputeLeaderboard() or
  // other critical step after this to protect; an incomplete backfill
  // should be visibly incomplete).
  console.error(`\n⚠ Backfill stopped after ${processed} match(es) — ${err.message}`);
  console.error("Already-processed matches above are saved. Re-run this script later (it's idempotent) to pick up where it left off.");
  process.exit(1);
}
