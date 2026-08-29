// Shared leaderboard recompute. Runs from scratch every time (idempotent).
//
// v2 scoring (§4) is applied via ../src/scoring.js:
//   result +3, exact +2 (only when the user set the score), against-the-grain
//   +2 (correct AND <25% consensus), Banker ×2 the fixture's points.
//
// This module also now:
//   • computes CONSENSUS per finished match (% of users on 1/X/2) and writes
//     it back onto the match doc — drives the against-the-grain bonus above
//     and the COWARD/UPSET/MODEL_DEFIER roasts (§5.1);
//   • computes each player's current correct-STREAK (trailing consecutive
//     correct picks in kickoff order) and stores it on the user doc (§3.8).
//
// Everything else (phase buckets, tiebreaker distance, champion +67,
// pointsHistory, overallRank) is unchanged. All aggregations remain pure
// functions of data this pass already loads, so nothing can go stale between
// runs and the +67 stays idempotent.
import { scorePrediction, phaseOf, outcomeOf } from "../src/scoring.js";
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

  // ── Consensus per finished match (§3.4) ──────────────────────────────
  // Tally every prediction's outcome for each finished match, then write the
  // percentages back onto the match. Computed here because this pass already
  // holds every prediction in memory — no extra reads.
  const tally = new Map(); // matchId -> { h, d, a }
  for (const p of preds.docs) {
    const d = p.data();
    if (!results.has(d.matchId)) continue;
    const oc = d.outcome || outcomeOf(d.home, d.away);
    const t = tally.get(d.matchId) || { h: 0, d: 0, a: 0 };
    if (oc === "1") t.h++; else if (oc === "X") t.d++; else t.a++;
    tally.set(d.matchId, t);
  }
  const consensusByMatch = new Map();
  for (const [mid, t] of tally) {
    const n = t.h + t.d + t.a;
    const div = n || 1;
    consensusByMatch.set(mid, {
      pctHome: Math.round((t.h / div) * 100),
      pctDraw: Math.round((t.d / div) * 100),
      pctAway: Math.round((t.a / div) * 100),
      n,
    });
  }
  // Persist consensus onto the match docs (admin write; bypasses client rules).
  {
    let cb = db.batch();
    let cn = 0;
    for (const [mid, c] of consensusByMatch) {
      cb.set(db.collection("matches").doc(mid), { consensus: c }, { merge: true });
      if (++cn % 400 === 0) { await cb.commit(); cb = db.batch(); }
    }
    await cb.commit();
  }

  const totals = new Map();      // uid -> row
  const predsByUid = new Map();  // uid -> [{ matchId, home, away, outcome, scoreExact, isBanker }]

  const blankRow = () => ({
    points: 0, exact: 0, results: 0,
    groupPoints: 0, groupExact: 0, groupResults: 0, groupPredictionsCount: 0,
    knockoutPoints: 0, knockoutExact: 0, knockoutResults: 0, knockoutPredictionsCount: 0,
    predictionsCount: 0, championBonus: 0, streak: 0,
  });

  for (const p of preds.docs) {
    const { uid, matchId, home, away, outcome, scoreExact, isBanker, displayName, photoURL } = p.data();

    if (!predsByUid.has(uid)) predsByUid.set(uid, []);
    predsByUid.get(uid).push({ matchId, home, away, outcome, scoreExact, isBanker });

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

      // Pass the FULL prediction (banker/scoreExact/outcome) + this match's
      // consensus so exact, banker and against-the-grain all apply.
      const s = scorePrediction(
        { home, away, outcome, scoreExact, isBanker },
        { ...m, phase },
        { consensus: consensusByMatch.get(matchId) }
      );
      if (s) {
        t.points += s.total;
        t[pointsKey] += s.total;
        if (s.exact) { t.exact += 1; t[exactKey] += 1; }
        else if (s.result) { t.results += 1; t[resultsKey] += 1; }
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
  const champSettings = await db.doc("settings/champion").get();
  const winner = champSettings.exists ? champSettings.data().winner : null;
  const championTeamByUid = new Map();
  if (winner) {
    const picks = await db.collection("championPicks").get();
    for (const p of picks.docs) {
      const { uid, team } = p.data();
      championTeamByUid.set(uid, team);
      const row = totals.get(uid) || blankRow();
      if (team === winner) { row.championBonus = CHAMPION_BONUS; row.points += CHAMPION_BONUS; }
      else { row.championBonus = 0; }
      totals.set(uid, row);
    }
  }

  // ── Per-user points history + current streak ─────────────────────────
  // Walk each player's predictions against the finished-match list in kickoff
  // order, using the SAME full-prediction + consensus scoring as above so the
  // running total matches the displayed points. `streak` is the trailing run
  // of consecutive correct picks (a wrong pick resets it; unpredicted matches
  // are skipped, not counted as breaks).
  for (const [uid, t] of totals) {
    const predMap = new Map((predsByUid.get(uid) || []).map((p) => [p.matchId, p]));
    let cum = 0;
    let run = 0;
    const history = [];
    for (const m of finishedSorted) {
      const pred = predMap.get(m.id);
      if (!pred) continue;
      const s = scorePrediction(pred, m, { consensus: consensusByMatch.get(m.id) });
      const gained = s ? s.total : 0;
      cum += gained;
      run = gained > 0 ? run + 1 : 0;
      history.push({
        label: `${m.home} v ${m.away}`,
        gained,
        cum,
        kind: s?.exact ? "exact" : gained > 0 ? "result" : "miss",
      });
    }
    t.streak = run;
    if (winner && championTeamByUid.get(uid) === winner && history.length > 0) {
      cum += CHAMPION_BONUS;
      history.push({ label: "🏆 Champion pick", gained: CHAMPION_BONUS, cum, kind: "champ" });
    }
    t.pointsHistory = history;
  }

  // ── Overall rank (all-time standings comparator) ─────────────────────
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
    if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  await batch.commit();
  return totals.size;
}
