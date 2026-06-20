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
export async function generateRoastsForLeagues(db, matchId, matchName, finalScore, { force = false } = {}) {
  try {
    const leaguesSnap = await db.collection("groups").get();
    if (leaguesSnap.empty) return;

    for (const leagueDoc of leaguesSnap.docs) {
      const leagueId = leagueDoc.id;

      const roastRef = db
        .collection("groups").doc(leagueId)
        .collection("matchRoasts").doc(matchId);
      const existingRoast = await roastRef.get();
      // Normally: skip if already generated. With force=true (used by the
      // backfill script's --force mode), recompute and overwrite anyway —
      // needed to retroactively fix roasts generated under an older,
      // buggy version of the targeting logic.
      if (existingRoast.exists && !force) continue;

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

      await roastRef.set({
        roastText,
        targetName:  target.name,
        targetUid:   target.uid,
        matchName,
        finalScore,
        // Preserve the original generation time on a forced overwrite, so
        // re-running --force doesn't scramble "most recent roast" ordering
        // on the homepage — only the content (target/text) changes.
        generatedAt: existingRoast.exists
          ? existingRoast.data().generatedAt
          : new Date().toISOString(),
      });

      console.log(
        `  🔥 Roast ${existingRoast.exists ? "updated" : "stored"} [${leagueId}] ${matchName} → ${target.name}`
      );
    }
  } catch (err) {
    console.error("Roast generation skipped (non-fatal):", err.message);
  }
}

// ── Global roast — one site-wide roast per finished match, for the
// homepage hero. Different rule from the per-league version: this always
// targets the current #1 OVERALL leaderboard player, full stop — not
// "whoever did best on this match." But it only fires for a match where
// that leader actually scored points on it; otherwise the roast template
// language ("+{pts} from {match}") would be citing points that don't
// exist. If the leader didn't predict the match, or predicted it and got
// it wrong, no global roast is generated for that match at all (same
// silent skip as when nobody scores).
const nameOf = (r) => r.nickname || r.displayName || "Unknown";

export async function generateGlobalRoast(db, matchId, matchName, finalScore, { force = false } = {}) {
  try {
    const roastRef = db.collection("globalRoasts").doc(matchId);
    const existing = await roastRef.get();
    if (existing.exists && !force) return;

    // Same tiebreak chain as Leaderboard.jsx (points → tbDistance → exact →
    // name) so "the overall leader" here can never disagree with who's
    // actually shown as #1 on the leaderboard. limit(10) is a generous
    // buffer — only matters if several players are tied at the very top.
    const topSnap = await db.collection("users").orderBy("points", "desc").limit(10).get();
    if (topSnap.empty) return;
    const candidates = topSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    candidates.sort(
      (a, b) =>
        (b.points ?? 0) - (a.points ?? 0) ||
        (a.tbDistance ?? Infinity) - (b.tbDistance ?? Infinity) ||
        (b.exact ?? 0) - (a.exact ?? 0) ||
        nameOf(a).localeCompare(nameOf(b), undefined, { numeric: true, sensitivity: "base" })
    );
    const leader = candidates[0];

    // Predictions are stored with doc id "<uid>_<matchId>" — direct lookup,
    // no need to scan every prediction for this match.
    const predDoc = await db.doc(`predictions/${leader.id}_${matchId}`).get();
    if (!predDoc.exists) return;
    const d = predDoc.data();
    if (d.home == null) return;

    const [homeScore, awayScore] = finalScore.split("-").map(Number);
    let pts = 0;
    if (d.home === homeScore && d.away === awayScore) {
      pts = 5;
    } else if (Math.sign(d.home - d.away) === Math.sign(homeScore - awayScore)) {
      pts = 3;
    }
    if (pts === 0) return; // leader didn't score on this one — keep the roast text honest

    const name = nameOf(leader);
    const totalPts = leader.points || 0;

    const roastText = generateRoast({
      matchId,
      name,
      pts,
      match:     matchName,
      score:     finalScore,
      leaguePos: ordinal(1), // by definition — this function only ever targets #1
      totalPts,
    });

    await roastRef.set({
      roastText,
      targetName:  name,
      targetUid:   leader.id,
      matchName,
      finalScore,
      generatedAt: existing.exists ? existing.data().generatedAt : new Date().toISOString(),
    });

    console.log(`  🔥 Global roast ${existing.exists ? "updated" : "stored"}: ${matchName} → ${name} (overall #1)`);
  } catch (err) {
    console.error("Global roast generation skipped (non-fatal):", err.message);
  }
}
