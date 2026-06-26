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
// Bracket picks schema (new rolling-deadline format):
//   brackets/{uid}.rounds = {
//     0: { picks: { "r0-0": "Argentina", ... }, lockedAt: Timestamp },
//     1: { picks: { "r1-0": "Argentina", ... }, lockedAt: Timestamp },
//     ...
//   }
//   Legacy format (flat picks) is also supported for migration.
function phaseOf(m) {
  if (m.phase === "group" || m.phase === "knockout") return m.phase;
  return m.competition && m.competition.includes("Group") ? "group" : "knockout";
}

// Merge bracket document picks into a single flat map regardless of schema version.
function mergeBracketPicks(docData) {
  if (docData.rounds) {
    const merged = {};
    for (const rData of Object.values(docData.rounds)) {
      Object.assign(merged, rData.picks || {});
    }
    return merged;
  }
  // Legacy flat format
  return docData.picks || {};
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

  // Knockout bracket points — these are inherently part of the knockout
  // competition, so they count toward knockoutPoints too, not just the
  // all-time total.
  const bracketDoc = await db.doc("settings/bracket").get();
  if (bracketDoc.exists) {
    const b = bracketDoc.data();
    const bracketResults = b.results || {};
    if (Object.keys(bracketResults).length > 0) {
      const allBrackets = await db.collection("brackets").get();
      for (const doc of allBrackets.docs) {
        // Support both new rounds-based schema and legacy flat picks
        const picks = mergeBracketPicks(doc.data());
        let bracketPoints = 0;
        for (const [matchId, winner] of Object.entries(bracketResults)) {
          const round = Number(matchId.match(/^r(\d+)-/)?.[1] ?? -1);
          if (round >= 0 && picks[matchId] === winner) {
            bracketPoints += b.points?.[round] ?? 0;
          }
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
