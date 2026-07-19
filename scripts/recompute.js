// Shared leaderboard recompute. All matches (group and knockout) score the
// same way: exact 5 OR result 3. The old +2 "who-advances" knockout bonus
// has been removed.
//
// The scoring rules now live in ../src/scoring.js — a framework-free module
// shared with the browser app — so there is no longer a hand-copied mirror
// here to keep in sync. (scoring.js imports nothing from Firebase or the DOM,
// so it loads fine under plain Node in CI.)
//
// Also computes tiebreaker distance once settings/tiebreaker.answer is set,
// and the one-off Champion-pick bonus once settings/champion.winner is set
// (+67 to whoever picked the eventual tournament winner). Both are folded in
// here rather than in scoring.js because they are leaderboard aggregations,
// not per-match scoring — and because this runs from scratch every time, the
// +67 is idempotent (no risk of stacking across repeated recomputes).
//
// Stage Tables: alongside the all-time totals (points/exact/results), also
// buckets the same numbers by tournament phase (groupPoints/knockoutPoints
// etc.) so the leaderboard can offer a Group Stage and Knockout view that
// resets at the tournament's natural checkpoints, without touching the
// all-time table. phaseOf() (also from scoring.js) falls back to inferring
// phase from the competition label for any match that predates the `phase`
// field being added to syncMatches.js.
//
// pointsHistory + overallRank: for the leaderboard's player modal. Because the
// modal reads these straight off the (public) user doc, it needs no extra
// Firestore reads and no rule changes. pointsHistory is the player's running
// point total across the matches THEY predicted, in kickoff order, with the
// +67 champion pick appended as a final entry once a winner is published.
// overallRank is the player's all-time position under the shared standings
// comparator. Both are pure functions of data recompute already has, and
// since points only ever change here, they can't go stale between runs.
//
// predictionsCount: every SETTLED prediction (the match has finished),
// whether or not it scored — the denominator for the leaderboard's
// points-per-prediction column.
import { scorePrediction, phaseOf } from "../src/scoring.js";
import { compareStandings } from "../src/standings.js";

// Points awarded once, after the Final, to anyone who picked the champion.
export const CHAMPION_BONUS = 67;

export async function recomputeLeaderboard(db) {
  const finished = await db.collection("matches").where("status", "==", "finished").get();
  const results = new Map(finished.docs.map((d) => [d.id, d.data()]));

  // Finished matches in kickoff order — the x-axis for every player's history.
  const finishedSorted = finished.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.kickoff?.toMillis?.() || 0) - (b.kickoff?.toMillis?.() || 0));

  const preds = await db.collection("predictions").get();
  const totals = new Map(); // uid -> {points, exact, results, groupPoints, ..., predictionsCount, displayName, photoURL}
  const predsByUid = new Map(); // uid -> [{ matchId, home, away }] — for pointsHistory

  const blankRow = () => ({
    points: 0, exact: 0, results: 0,
    groupPoints: 0, groupExact: 0, groupResults: 0, groupPredictionsCount: 0,
    knockoutPoints: 0, knockoutExact: 0, knockoutResults: 0, knockoutPredictionsCount: 0,
    predictionsCount: 0, championBonus: 0,
  });

  for (const p of preds.docs) {
    const { uid, matchId, home, away, displayName, photoURL } = p.data();

    // Collect every prediction per user (not just settled ones) so the history
    // pass below can walk them against the finished-match list in kickoff order.
    if (!predsByUid.has(uid)) predsByUid.set(uid, []);
    predsByUid.get(uid).push({ matchId, home, away });

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

      const s = scorePrediction({ home, away }, { ...m, phase });
      if (s) {
        t.points += s.total;
        t[pointsKey] += s.total;
        // Counts stay descriptive: an exact is tallied as exact; a non-exact
        // correct result as a result.
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
  // and the +67 lands only on the player(s) who named the eventual winner.
  // championBonus is written for everyone with a pick (0 or 67) so the field
  // never goes stale on a re-run after the winner changes or is cleared.
  // championTeamByUid is captured so the history pass can append the spike.
  const champSettings = await db.doc("settings/champion").get();
  const winner = champSettings.exists ? champSettings.data().winner : null;
  const championTeamByUid = new Map();
  if (winner) {
    const picks = await db.collection("championPicks").get();
    for (const p of picks.docs) {
      const { uid, team } = p.data();
      championTeamByUid.set(uid, team);
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

  // ── Per-user points history (running total in kickoff order) ──────────
  // Walks each player's predictions against the finished-match list, recording
  // a compact entry per scoring event. The +67 champion pick is appended last
  // (only when a winner is set and the player picked them), so the final `cum`
  // equals the player's displayed total.
  for (const [uid, t] of totals) {
    const predMap = new Map((predsByUid.get(uid) || []).map((p) => [p.matchId, p]));
    let cum = 0;
    const history = [];
    for (const m of finishedSorted) {
      const pred = predMap.get(m.id);
      if (!pred) continue;
      const s = scorePrediction({ home: pred.home, away: pred.away }, m);
      const gained = s ? s.total : 0;
      cum += gained;
      history.push({
        label: `${m.home} v ${m.away}`,
        gained,
        cum,
        kind: s?.exact ? "exact" : gained > 0 ? "result" : "miss",
      });
    }
    if (winner && championTeamByUid.get(uid) === winner && history.length > 0) {
      cum += CHAMPION_BONUS;
      history.push({ label: "🏆 Champion pick", gained: CHAMPION_BONUS, cum, kind: "champ" });
    }
    t.pointsHistory = history;
  }

  // ── Overall rank (all-time standings comparator) ─────────────────────
  // Same comparator the Leaderboard uses for the Overall scope, so a stored
  // rank can never disagree with the live table. Written so the modal can
  // pick a rank-based roast without any query of its own.
  const ranked = [...totals.entries()]
    .map(([uid, t]) => ({ uid, ...t }))
    .sort((a, b) => compareStandings(a, b));
  ranked.forEach((r, i) => {
    totals.get(r.uid).overallRank = i + 1;
  });

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
