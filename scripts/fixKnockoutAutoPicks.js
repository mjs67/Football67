// ONE-TIME fix for auto-picked predictions on KNOCKOUT matches.
//
// v2 — targets by `autoPicked: true` alone, NOT by "is the value still 1–1".
// A prior run of an earlier version of this script (or the old blanket
// safety net) may have already replaced the original 1–1 default with a
// decisive score, so filtering on "== 1–1" silently skips everything that's
// already been touched once. `autoPicked: true` is the reliable marker
// either way — a manual save always wipes it (MatchCard's save() does a
// non-merge setDoc), so it can never be true on a genuine player pick.
//
// Splits into two cases:
//
//   FINISHED knockout matches — `odds` has been recomputed and overwritten
//   by every sync since the match ended (finishedSeason folds the match's
//   own result, and any later results, back into the team-strength stats).
//   That makes any "AI model" prediction derived from it hindsight-informed,
//   not a genuine pre-match call — including whatever was written by an
//   earlier run of this script. These are (re-)settled with an honest 50/50
//   coin flip, tagged `autoPickMethod: "coinflip"`. Already-coinflipped docs
//   are left alone (idempotent — re-running won't re-roll them).
//
//   STILL-UPCOMING knockout matches — the match hasn't happened yet, so its
//   stored `odds` are a clean, uncontaminated pre-match read. These get (or
//   keep getting, on re-runs) the real AI model prediction (poisson.js
//   predictKnockout), tagged `autoPickMethod: "model"`.
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
let alreadyCoinflipped = 0;
let skippedNoOdds = 0;

for (const d of predsSnap.docs) {
  const p = d.data();
  const m = matches.get(p.matchId);
  if (!m) continue; // group match — leave alone, this script is knockout-only

  if (m.status === "finished") {
    if (p.autoPickMethod === "coinflip") {
      alreadyCoinflipped++;
      continue; // already fixed on a previous run — leave the roll as-is
    }
    const score = randomDrawScore();
    console.log(
      `  - ${p.displayName || p.uid} — ${m.home} v ${m.away} (FT): ${p.home}-${p.away} -> ${score.home}-${score.away} (coin flip)`
    );
    batch.update(d.ref, {
      home: score.home,
      away: score.away,
      autoPickMethod: "coinflip",
      updatedAt: admin.firestore.Timestamp.now(),
    });
    fixedCoinflip++;
  } else {
    const score = modelScoreFor(m);
    if (!score) {
      skippedNoOdds++;
      console.log(`  ! skipping ${p.displayName || p.uid} — ${p.matchId} (no odds yet)`);
      continue;
    }
    console.log(
      `  - ${p.displayName || p.uid} — ${m.home} v ${m.away} (upcoming): ${p.home}-${p.away} -> ${score.home}-${score.away} (model)`
    );
    batch.update(d.ref, {
      home: score.home,
      away: score.away,
      autoPickMethod: "model",
      updatedAt: admin.firestore.Timestamp.now(),
    });
    fixedModel++;
  }

  if (++n % 400 === 0) {
    await batch.commit();
    batch = db.batch();
  }
}
await batch.commit();

console.log(`Fixed ${fixedCoinflip} finished knockout auto-pick(s) via coin flip.`);
console.log(`Fixed ${fixedModel} upcoming knockout auto-pick(s) via AI model.`);
console.log(`Already coin-flipped (left as-is): ${alreadyCoinflipped}.`);
console.log(`Skipped ${skippedNoOdds} (no odds yet).`);

console.log("Recomputing leaderboard…");
const players = await recomputeLeaderboard(db);
console.log(`Updated ${players} players.`);
process.exit(0);
