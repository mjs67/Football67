// Shared leaderboard recompute: exact = 5, correct result = 3.
// Also computes tiebreaker distance once settings/tiebreaker.answer is set.
//
// Stage Tables: alongside the all-time totals (points/exact/results), also
// buckets the same numbers by tournament phase (groupPoints/knockoutPoints
// etc.) so the leaderboard can offer a Group Stage and Knockout view that
// resets at the tournament's natural checkpoints, without touching the
// all-time table. Falls back to inferring phase from the competition label
// for any match that predates the `phase` field being added to
// syncMatches.js (matches outside its rolling sync window never get
// backfilled with new fields — see backfillRoasts.js for the same issue
// with roasts).
//
// predictionsCount: every SETTLED prediction (the match has finished),
// whether or not it scored — the denominator for the leaderboard's
// points-per-prediction column.
//
// Bracket scoring schema (champion-tier model):
//   brackets/{uid}.champion = {
//     team: "France",   // the user's current champion pick
//     tier: 1,          // round-window (0=R16,1=QF,2=SF,3=Final) in which
//                       // the CURRENT team was last set — lower = earlier =
//                       // more points. Re-picking re-stamps this.
//     history: { 0: "Argentina", 1: "France" }  // optional, audit/share
//   }
//   Only the champion pick scores. Points come from settings/bracket.tierPoints
//   indexed by `tier`, awarded only if `team` === settings/bracket.winner.
//
//   The full fillable tree (brackets/{uid}.rounds[r].picks) is kept for the
//   visual + share card but does NOT score. Legacy flat `picks` is ignored
//   for scoring under this model.
function phaseOf(m) {
  if (m.phase === "group" || m.phase === "knockout") return m.phase;
  return m.competition && m.competition.includes("Group") ? "group" : "knockout";
}

export async function recomputeLeaderboard(db) {
  const finished = await db.collection("matches").where("status", "==", "finished").get();
  const results = new Map(finished.docs.map((d) => [d.id, d.data()]));

  const preds = await db.collection("predictions").get();
  const totals = new Map(); // uid -> {points, exact, results, groupPoints, ..., predictionsCount, displayName, photoURL}

  const blankRow = () => ({
    points: 0, exact: 0, results: 0,
    groupPoints: 0, groupExact: 0, groupResults: 0, groupPredictionsCount: 0,
    knockoutPoints: 0, knockoutExact: 0, knockoutResults: 0, knockoutPredictionsCount: 0,
    predictionsCount: 0,
  });

  for (const p of preds.docs) {
    const { uid, matchId, home, away, displayName, photoURL } = p.data();
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

      if (home === m.homeScore && away === m.awayScore) {
        t.points += 5;
        t.exact += 1;
        t[pointsKey] += 5;
        t[exactKey] += 1;
      } else if (Math.sign(home - away) === Math.sign(m.homeScore - m.awayScore)) {
        t.points += 3;
        t.results += 1;
        t[pointsKey] += 3;
        t[resultsKey] += 1;
      }
    }
    if (displayName) t.displayName = displayName;
    if (photoURL !== undefined) t.photoURL = photoURL;
    totals.set(uid, t);
  }

  // Knockout champion-tier points — the user's single champion prediction,
  // scored by the round-window in which they locked it, paid only if that
  // team actually won the tournament. Part of the knockout competition.
  //
  // The tournament winner is derived from the finished final match (single
  // source of truth in the `matches` collection), not a field on settings.
  const bracketDoc = await db.doc("settings/bracket").get();
  if (bracketDoc.exists) {
    const b = bracketDoc.data();
    const tierPoints = b.tierPoints || [20, 14, 9, 5];
    const finalSlot = `r${(b.rounds ?? 4) - 1}-0`;

    // Find the finished final match by its bracket slot.
    let winner = null;
    const finalSnap = await db
      .collection("matches")
      .where("bracketSlot", "==", finalSlot)
      .where("status", "==", "finished")
      .get();
    if (!finalSnap.empty) {
      const fm = finalSnap.docs[0].data();
      winner =
        fm.advancedTeam ||
        (fm.homeScore != null && fm.awayScore != null && fm.homeScore !== fm.awayScore
          ? fm.homeScore > fm.awayScore ? fm.home : fm.away
          : null);
    }

    if (winner) {
      const allBrackets = await db.collection("brackets").get();
      for (const doc of allBrackets.docs) {
        const champ = doc.data().champion;
        let bracketPoints = 0;
        if (champ && champ.team === winner) {
          const tier = Number(champ.tier ?? tierPoints.length - 1);
          bracketPoints = tierPoints[tier] ?? 0;
        }
        const row = totals.get(doc.id) || blankRow();
        row.points += bracketPoints;
        row.knockoutPoints += bracketPoints;
        row.bracketPoints = bracketPoints;
        totals.set(doc.id, row);
      }
    }
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
