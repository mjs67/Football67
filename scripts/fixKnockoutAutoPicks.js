// ONE-TIME fix for auto-picked predictions on KNOCKOUT matches that were
// lodged with the old blanket 1–1 default (see syncMatches.js's auto-pick
// safety net, now patched to be phase-aware going forward).
//
// Splits into two cases:
//
//   FINISHED knockout matches — their `odds` field has been recomputed and
//   overwritten by every sync since the match ended (finishedSeason folds
//   the match's own result, and any later results, back into the team-
//   strength stats). That makes any "AI model" prediction derived from it
//   hindsight-informed, not a genuine pre-match call. Rather than pass that
//   off as a prediction, these are settled with an honest 50/50 coin flip,
//   tagged `autoPickMethod: "coinflip"` so it's clearly not the model.
//
//   STILL-UPCOMING knockout matches — the match hasn't happened yet, so
//   its stored `odds` are a clean, uncontaminated pre-match read. These use
//   the real AI model prediction (poisson.js predictKnockout), tagged
//   `autoPickMethod: "model"` — same as the live safety net now does.
//
// Only touches docs with `autoPicked: true` that still hold the literal
// 1–1 default. Genuine manual picks are never flagged that way (MatchCard's
// save() does a non-merge setDoc, which wipes the field entirely), so this
// can never overwrite a real player pick.
//
// Run from the project root:  node scripts/fixKnockoutAutoPicks.js
import { db, admin } from "./admin.js";
import { recomputeLeaderboard } from "./recompute.js";
import { predictKnockout } from "../src/poisson.js";

// Fair coin flip — no information used, deliberately, since the odds for an
// already-finished match can no longer be trusted as pre-match.
function randomDrawScore() {
  return Math.random() < 0.5 ? { home: 1, away: 0 } : { home: 0, away: 1 };
}

function modelScoreFor(m) {
  if (!m.odds) return null;
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
let fixedCoinflip = 0;
let fixedModel = 0;
let skippedNoOdds = 0;

for (const d of predsSnap.docs) {
  const p = d.data();
  const m = matches.get(p.matchId);
  if (!m) continue; // group match — old 1–1 default is fine, leave it
  if (p.home !== 1 || p.away !== 1) continue; // already fixed / not the old default

  let score, method;
  if (m.status === "finished") {
    score = randomDrawScore();
    method = "coinflip";
    console.log(
      `  - ${p.displayName || p.uid} — ${m.home} v ${m.away} (FT): 1–1 -> ${score.home}–${score.away} (coin flip)`
    );
  } else {
    score = modelScoreFor(m);
    if (!score) {
      skippedNoOdds++;
      console.log(`  ! skipping ${p.displayName || p.uid} — ${p.matchId} (no odds yet)`);
      continue;
    }
    method = "model";
    console.log(
      `  - ${p.displayName || p.uid} — ${m.home} v ${m.away} (upcoming): 1–1 -> ${score.home}–${score.away} (model)`
    );
  }

  batch.update(d.ref, {
    home: score.home,
    away: score.away,
    autoPickMethod: method,
    updatedAt: admin.firestore.Timestamp.now(),
  });
  if (method === "coinflip") fixedCoinflip++;
  else fixedModel++;
  if (++n % 400 === 0) {
    await batch.commit();
    batch = db.batch();
  }
}
await batch.commit();

console.log(`Fixed ${fixedCoinflip} finished knockout auto-pick(s) via coin flip.`);
console.log(`Fixed ${fixedModel} upcoming knockout auto-pick(s) via AI model.`);
console.log(`Skipped ${skippedNoOdds} (no odds yet).`);

console.log("Recomputing leaderboard…");
const players = await recomputeLeaderboard(db);
console.log(`Updated ${players} players.`);
process.exit(0);
