// Shared roast-generation logic. Used by both scripts/syncMatches.js (live,
// runs on whatever's in the current rolling sync window) and
// scripts/backfillRoasts.js (one-off, runs against every finished match in
// Firestore regardless of how old it is). Keeping this in one place means
// the two can never drift out of sync on targeting logic.
import { generateRoast } from "./roastTemplates.js";

// Picks whoever performed BEST on this specific match (exact score beats
// correct-result-only). Standing/rank only breaks ties between players who
// scored the same points on this match — it never overrides who actually
// called it right.
export function pickRoastTarget(scorers, standings) {
  if (scorers.length === 1) return scorers[0];
  const bestPts = Math.max(...scorers.map((sc) => sc.pts));
  const topScorers = scorers.filter((sc) => sc.pts === bestPts);
  if (topScorers.length === 1) return topScorers[0];
  const highestRanked = standings.find((s) =>
    topScorers.some((sc) => sc.uid === s.uid)
  );
  return topScorers.find((sc) => sc.uid === highestRanked?.uid) ?? topScorers[0];
}

export const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

// ── Per-league roast — fires once per finished match, per league ──
export async function generateRoastsForLeagues(db, matchId, matchName, finalScore) {
  try {
    const leaguesSnap = await db.collection("groups").get();
    if (leaguesSnap.empty) return;

    for (const leagueDoc of leaguesSnap.docs) {
      const leagueId = leagueDoc.id;

      // Skip if roast already exists for this match in this league
      const existingRoast = await db
        .collection("groups").doc(leagueId)
        .collection("matchRoasts").doc(matchId)
        .get();
      if (existingRoast.exists) continue;

      const leagueData = leagueDoc.data();
      const memberUids = leagueData.members || [];
      if (memberUids.length === 0) continue;

      // Get all predictions for this match
      const predsSnap = await db
        .collection("predictions")
        .where("matchId", "==", matchId)
        .get();
      if (predsSnap.empty) continue;

      // Filter to league members who scored points on this match
      const [homeScore, awayScore] = finalScore.split("-").map(Number);
      const scorers = [];
      for (const predDoc of predsSnap.docs) {
        const d = predDoc.data();
        if (!memberUids.includes(d.uid)) continue;
        if (d.home == null) continue;
        let pts = 0;
        if (d.home === homeScore && d.away === awayScore) {
          pts = 5;
        } else if (Math.sign(d.home - d.away) === Math.sign(homeScore - awayScore)) {
          pts = 3;
        }
        if (pts > 0) {
          const userDoc = await db.collection("users").doc(d.uid).get();
          const name = userDoc.exists
            ? (userDoc.data().nickname || userDoc.data().displayName || d.displayName || "Unknown")
            : (d.displayName || "Unknown");
          scorers.push({ uid: d.uid, name, pts });
        }
      }
      if (scorers.length === 0) continue;

      // Get league standings (league members only, ordered by total points)
      const allUsersSnap = await db.collection("users").orderBy("points", "desc").get();
      const leagueStandings = allUsersSnap.docs
        .filter(d => memberUids.includes(d.id))
        .map((d, i) => ({ uid: d.id, rank: i + 1, totalPts: d.data().points || 0 }));

      const target = pickRoastTarget(scorers, leagueStandings);

      const targetStanding = leagueStandings.find(s => s.uid === target.uid);
      const rank = targetStanding?.rank ?? 1;
      const totalPts = targetStanding?.totalPts ?? 0;

      const roastText = generateRoast({
        matchId,
        name:      target.name,
        pts:       target.pts,
        match:     matchName,
        score:     finalScore,
        leaguePos: ordinal(rank),
        totalPts,
      });

      await db
        .collection("groups").doc(leagueId)
        .collection("matchRoasts").doc(matchId)
        .set({
          roastText,
          targetName:  target.name,
          targetUid:   target.uid,
          matchName,
          finalScore,
          generatedAt: new Date().toISOString(),
        });

      console.log(`  🔥 Roast stored [${leagueId}] ${matchName} → ${target.name}`);
    }
  } catch (err) {
    console.error("Roast generation skipped (non-fatal):", err.message);
  }
}

// ── Global roast — one site-wide roast per finished match, for the
// homepage hero. Public, not tied to any league: looks at the GLOBAL
// leaderboard and ALL predictions for the match.
export async function generateGlobalRoast(db, matchId, matchName, finalScore) {
  try {
    const existing = await db.collection("globalRoasts").doc(matchId).get();
    if (existing.exists) return;

    const predsSnap = await db
      .collection("predictions")
      .where("matchId", "==", matchId)
      .get();
    if (predsSnap.empty) return;

    const [homeScore, awayScore] = finalScore.split("-").map(Number);
    const scorers = [];
    for (const predDoc of predsSnap.docs) {
      const d = predDoc.data();
      if (d.home == null) continue;
      let pts = 0;
      if (d.home === homeScore && d.away === awayScore) {
        pts = 5;
      } else if (Math.sign(d.home - d.away) === Math.sign(homeScore - awayScore)) {
        pts = 3;
      }
      if (pts > 0) {
        const userDoc = await db.collection("users").doc(d.uid).get();
        const name = userDoc.exists
          ? (userDoc.data().nickname || userDoc.data().displayName || d.displayName || "Unknown")
          : (d.displayName || "Unknown");
        scorers.push({ uid: d.uid, name, pts });
      }
    }
    if (scorers.length === 0) return;

    const allUsersSnap = await db.collection("users").orderBy("points", "desc").get();
    const standings = allUsersSnap.docs.map((d, i) => ({
      uid: d.id,
      rank: i + 1,
      totalPts: d.data().points || 0,
    }));

    const target = pickRoastTarget(scorers, standings);
    const targetStanding = standings.find((s) => s.uid === target.uid);
    const rank = targetStanding?.rank ?? 1;
    const totalPts = targetStanding?.totalPts ?? 0;

    const roastText = generateRoast({
      matchId,
      name:      target.name,
      pts:       target.pts,
      match:     matchName,
      score:     finalScore,
      leaguePos: ordinal(rank),
      totalPts,
    });

    await db.collection("globalRoasts").doc(matchId).set({
      roastText,
      targetName:  target.name,
      targetUid:   target.uid,
      matchName,
      finalScore,
      generatedAt: new Date().toISOString(),
    });

    console.log(`  🔥 Global roast stored: ${matchName} → ${target.name}`);
  } catch (err) {
    console.error("Global roast generation skipped (non-fatal):", err.message);
  }
}
