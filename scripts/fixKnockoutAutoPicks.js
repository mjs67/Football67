// Fixes existing auto-picked predictions on KNOCKOUT matches that were
// lodged with the old blanket 1–1 default (see syncMatches.js's auto-pick
// safety net). A 1–1 on a knockout match almost always scores 0, since
// knockouts are designed to produce a winner. This rewrites those picks to
// the AI model's predicted winner (poisson.js predictKnockout, using the
// match's stored odds), for BOTH already-finished knockout matches (so
// affected players get correctly re-scored) and still-upcoming ones (so
// the standing auto-pick stops being a guaranteed zero).
//
// Only touches docs with `autoPicked: true` — genuine manual picks are never
// flagged that way (MatchCard's save() does a non-merge setDoc, which wipes
// the field entirely), so this can never overwrite a real player pick.
//
// Run from the project root:  node scripts/fixKnockoutAutoPicks.js
import { db, admin } from "./admin.js";
import { recomputeLeaderboard } from "./recompute.js";
import { predictKnockout } from "../src/poisson.js";

function fixedScoreFor(m) {
  if (!m.odds) return null; // no model odds yet — nothing to base a pick on
  const ko = predictKnockout(m.odds.lh, m.odds.la);
  if (ko.decided === "regulation") return { home: ko.h, away: ko.a };
  // Model's top scoreline was level (shootout territory) — nudge the
  // predicted advancer up a goal so the pick is a decisive result.
  return ko.advancer === "H" ? { home: ko.h + 1, away: ko.a } : { home: ko.h, away: ko.a + 1 };
}

const matchesSnap = await db.collection("matches").where("phase", "==", "knockout").get();
const matches = new Map(matchesSnap.docs.map((d) => [d.id, d.data()]));
console.log(`Found ${matches.size} knockout match(es).`);

const predsSnap = await db.collection("predictions").where("autoPicked", "==", true).get();

let batch = db.batch();
let n = 0;
let fixed = 0;
let skippedNoOdds = 0;

for (const d of predsSnap.docs) {
  const p = d.data();
  const m = matches.get(p.matchId);
  if (!m) continue; // group match — old 1–1 default is fine, leave it
  if (p.home !== 1 || p.away !== 1) continue; // already fixed / not the old default

  const score = fixedScoreFor(m);
  if (!score) {
    skippedNoOdds++;
    console.log(`  ! skipping ${p.displayName || p.uid} — ${p.matchId} (no odds yet)`);
    continue;
  }

  console.log(
    `  - ${p.displayName || p.uid} — ${m.home} v ${m.away}: 1–1 -> ${score.home}–${score.away}`
  );
  batch.update(d.ref, {
    home: score.home,
    away: score.away,
    updatedAt: admin.firestore.Timestamp.now(),
  });
  fixed++;
  if (++n % 400 === 0) {
    await batch.commit();
    batch = db.batch();
  }
}
await batch.commit();

console.log(`Fixed ${fixed} auto-pick(s). Skipped ${skippedNoOdds} (no odds yet).`);

console.log("Recomputing leaderboard…");
const players = await recomputeLeaderboard(db);
console.log(`Updated ${players} players.`);
process.exit(0);
