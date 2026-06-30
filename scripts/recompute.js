// Shared leaderboard recompute. Group games: exact 5 OR result 3.
// Knockout games: exact +5, result +3, and who-advances +2 all STACK
// (up to 10), with the advance bonus paid whenever the predicted advancer
// matches the side that actually went through (90 mins, ET, or penalties).
//
// The scoring rules now live in ../src/scoring.js — a framework-free module
// shared with the browser app — so there is no longer a hand-copied mirror
// here to keep in sync. (scoring.js imports nothing from Firebase or the DOM,
// so it loads fine under plain Node in CI.)
//
// Also computes tiebreaker distance once settings/tiebreaker.answer is set,
// and the one-off Champion-pick bonus once settings/champion.winner is set
// (+30 to whoever picked the eventual tournament winner). Both are folded in
// here rather than in scoring.js because they are leaderboard aggregations,
// not per-match scoring — and because this runs from scratch every time, the
// +30 is idempotent (no risk of stacking across repeated recomputes).
//
// Stage Tables: alongside the all-time totals (points/exact/results), also
// buckets the same numbers by tournament phase (groupPoints/knockoutPoints
// etc.) so the leaderboard can offer a Group Stage and Knockout view that
// resets at the tournament's natural checkpoints, without touching the
// all-time table. phaseOf() (also from scoring.js) falls back to inferring
// phase from the competition label for any match that predates the `phase`
// field being added to syncMatches.js.
//
// predictionsCount: every SETTLED prediction (the match has finished),
// whether or not it scored — the denominator for the leaderboard's
// points-per-prediction column.
import { scorePrediction, phaseOf } from "../src/scoring.js";

// Points awarded once, after the Final, to anyone who picked the champion.
export const CHAMPION_BONUS = 30;

export async function recomputeLeaderboard(db) {
  const finished = await db.collection("matches").where("status", "==", "finished").get();
  const results = new Map(finished.docs.map((d) => [d.id, d.data()]));

  const preds = await db.collection("predictions").get();
  const totals = new Map(); // uid -> {points, exact, results, groupPoints, ..., predictionsCount, displayName, photoURL}

  const blankRow = () => ({
    points: 0, exact: 0, results: 0,
    groupPoints: 0, groupExact: 0, groupResults: 0, groupPredictionsCount: 0,
    knockoutPoints: 0, knockoutExact: 0, knockoutResults: 0, knockoutPredictionsCount: 0,
    predictionsCount: 0, championBonus: 0,
  });

  for (const p of preds.docs) {
    const { uid, matchId, home, away, advance, displayName, photoURL } = p.data();
    const m = results.get(matchId);
    const t = totals.get(uid) || blankRow();
    if (m) {
      t.predictionsCount += 1;
      const phase = phaseOf(m);
      const pointsKey = phase === "group" ? "groupPoints" : "knockoutPoints";
      const exactKey = phase === "group" ? "groupExact" : "knockoutExact";
      const resultsKey = phase === "group" ? "groupResults" : "knockoutResults";
      const countKey = phase === "group" ? "groupPredictionsCount" : "knockoutPredictionsCount";
      t[countKey] += 1;

      // Normalise phase onto the match so scorePrediction's knockout-stacking
      // path matches the leaderboard's phase buckets (phaseOf can infer phase
      // for older matches that predate the `phase` field).
      const s = scorePrediction({ home, away, advance }, { ...m, phase });
      if (s) {
        t.points += s.total;
        t[pointsKey] += s.total;
        // Counts stay descriptive: an exact is tallied as exact; a non-exact
        // correct result as a result. Points already reflect the stacking.
        if (s.exact) {
          t.exact += 1;
          t[exactKey] += 1;
        } else if (s.result) {
          t.results += 1;
          t[resultsKey] += 1;
        }
      }
    }
    if (displayName) t.displayName = displayName;
    if (photoURL !== undefined) t.photoURL = photoURL;
    totals.set(uid, t);
  }

  // Tiebreaker distances (only when an answer has been published)
  const tbSettings = await db.doc("settings/tiebreaker").get();
  const answer = tbSettings.exists ? tbSettings.data().answer : null;
  if (answer !== null && answer !== undefined) {
    const tbs = await db.collection("tiebreakers").get();
    for (const t of tbs.docs) {
      const { uid, value } = t.data();
      const row = totals.get(uid) || blankRow();
      row.tbDistance = Math.abs(value - answer);
      totals.set(uid, row);
    }
  }

  // Champion-pick bonus (only once the tournament winner has been published).
  // Mirrors the tiebreaker pass above: every championPicks doc gets a row,
  // and the +30 lands only on the player(s) who named the eventual winner.
  // championBonus is written for everyone with a pick (0 or 30) so the field
  // never goes stale on a re-run after the winner changes or is cleared.
  const champSettings = await db.doc("settings/champion").get();
  const winner = champSettings.exists ? champSettings.data().winner : null;
  if (winner) {
    const picks = await db.collection("championPicks").get();
    for (const p of picks.docs) {
      const { uid, team } = p.data();
      const row = totals.get(uid) || blankRow();
      if (team === winner) {
        row.championBonus = CHAMPION_BONUS;
        row.points += CHAMPION_BONUS;
      } else {
        row.championBonus = 0;
      }
      totals.set(uid, row);
    }
  }

  let batch = db.batch();
  let n = 0;
  for (const [uid, t] of totals) {
    batch.set(db.collection("users").doc(uid), t, { merge: true });
    if (++n % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  await batch.commit();
  return totals.size;
}
