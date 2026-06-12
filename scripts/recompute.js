// Shared leaderboard recompute: exact = 5, correct result = 3.
// Also computes tiebreaker distance once settings/tiebreaker.answer is set.
export async function recomputeLeaderboard(db) {
  const finished = await db.collection("matches").where("status", "==", "finished").get();
  const results = new Map(finished.docs.map((d) => [d.id, d.data()]));

  const preds = await db.collection("predictions").get();
  const totals = new Map(); // uid -> {points, exact, results, displayName, photoURL}

  for (const p of preds.docs) {
    const { uid, matchId, home, away, displayName, photoURL } = p.data();
    const m = results.get(matchId);
    const t = totals.get(uid) || { points: 0, exact: 0, results: 0 };
    if (m) {
      if (home === m.homeScore && away === m.awayScore) {
        t.points += 5;
        t.exact += 1;
      } else if (Math.sign(home - away) === Math.sign(m.homeScore - m.awayScore)) {
        t.points += 3;
        t.results += 1;
      }
    }
    if (displayName) t.displayName = displayName;
    if (photoURL !== undefined) t.photoURL = photoURL;
    totals.set(uid, t);
  }

  // Knockout bracket points
  const bracketDoc = await db.doc("settings/bracket").get();
  if (bracketDoc.exists) {
    const b = bracketDoc.data();
    const results = b.results || {};
    if (Object.keys(results).length > 0) {
      const allBrackets = await db.collection("brackets").get();
      for (const doc of allBrackets.docs) {
        const picks = doc.data().picks || {};
        let bracketPoints = 0;
        for (const [matchId, winner] of Object.entries(results)) {
          const round = Number(matchId.match(/^r(\d+)-/)?.[1] ?? -1);
          if (round >= 0 && picks[matchId] === winner) {
            bracketPoints += b.points?.[round] ?? 0;
          }
        }
        const row = totals.get(doc.id) || { points: 0, exact: 0, results: 0 };
        row.points += bracketPoints;
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
      const row = totals.get(uid) || { points: 0, exact: 0, results: 0 };
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
