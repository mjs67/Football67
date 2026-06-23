// Shared roast-generation logic. Used by both scripts/syncMatches.js (live,
// runs on whatever's in the current rolling sync window) and
// scripts/backfillRoasts.js (one-off, runs against every finished match in
// Firestore regardless of how old it is). Keeping this in one place means
// the two can never drift out of sync on targeting logic.
//
// Read efficiency: buildRoastContext() fetches the leagues list and the
// full users collection ONCE per script run, not once per match. The
// caller also fetches each match's predictions once and passes them to
// both generators, instead of each generator querying independently. For
// a 43-match backfill across 3 leagues, this took the read count from
// several thousand (mostly a full users-collection scan repeated for every
// match×league pair) down to roughly a hundred — the difference between
// burning through Firestore's free-tier daily quota and not.
import { generateRoast } from "./roastTemplates.js";

const nameOf = (r) => r.nickname || r.displayName || "Unknown";

// Call once per script run (sync or backfill), before looping over matches.
export async function buildRoastContext(db) {
  const [leaguesSnap, usersSnap] = await Promise.all([
    db.collection("groups").get(),
    db.collection("users").orderBy("points", "desc").get(),
  ]);
  const leagues = leaguesSnap.docs.map((d) => ({
    id: d.id,
    members: d.data().members || [],
  }));
  // Sorted by points only (Firestore's native order) — this is exactly the
  // ordering the league-standings logic always used, preserved as-is.
  const usersByPoints = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const usersById = new Map(usersByPoints.map((u) => [u.id, u]));
  return { leagues, usersByPoints, usersById };
}

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

function scorePrediction(d, homeScore, awayScore) {
  if (d.home == null) return 0;
  if (d.home === homeScore && d.away === awayScore) return 5;
  if (Math.sign(d.home - d.away) === Math.sign(homeScore - awayScore)) return 3;
  return 0;
}

// ── Per-league roast — fires once per finished match, per league ──
// `preds` is the already-fetched array of prediction data for this match
// (from `db.collection("predictions").where("matchId","==",matchId).get()`,
// docs mapped to `.data()`), fetched once by the caller and shared with
// generateGlobalRoast — not re-queried here.
export async function generateRoastsForLeagues(db, ctx, matchId, matchName, finalScore, preds, { force = false } = {}) {
  try {
    if (ctx.leagues.length === 0 || preds.length === 0) return;
    const [homeScore, awayScore] = finalScore.split("-").map(Number);

    for (const league of ctx.leagues) {
      const roastRef = db
        .collection("groups").doc(league.id)
        .collection("matchRoasts").doc(matchId);
      const existingRoast = await roastRef.get();
      // Normally: skip if already generated. With force=true (used by the
      // backfill script's --force mode), recompute and overwrite anyway —
      // needed to retroactively fix roasts generated under an older,
      // buggy version of the targeting logic.
      if (existingRoast.exists && !force) continue;

      const memberUids = league.members;
      if (memberUids.length === 0) continue;

      // Filter to league members who scored points on this match
      const scorers = [];
      for (const d of preds) {
        if (!memberUids.includes(d.uid)) continue;
        const pts = scorePrediction(d, homeScore, awayScore);
        if (pts > 0) {
          const u = ctx.usersById.get(d.uid);
          const name = u ? nameOf(u) : (d.displayName || "Unknown");
          scorers.push({ uid: d.uid, name, pts });
        }
      }
      if (scorers.length === 0) continue;

      // League standings (members only), same ordering as before —
      // sourced from the cached, points-sorted user list now instead of a
      // fresh full-collection query.
      const leagueStandings = ctx.usersByPoints
        .filter((u) => memberUids.includes(u.id))
        .map((u, i) => ({ uid: u.id, rank: i + 1, totalPts: u.points || 0 }));

      const target = pickRoastTarget(scorers, leagueStandings);
      const targetStanding = leagueStandings.find((s) => s.uid === target.uid);
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
        `  🔥 Roast ${existingRoast.exists ? "updated" : "stored"} [${league.id}] ${matchName} → ${target.name}`
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
// it wrong, no global roast is generated for that match at all.
export async function generateGlobalRoast(db, ctx, matchId, matchName, finalScore, preds, { force = false } = {}) {
  try {
    const roastRef = db.collection("globalRoasts").doc(matchId);
    const existing = await roastRef.get();
    if (existing.exists && !force) return;

    // On a forced regenerate, a match that USED to qualify (under whatever
    // logic generated the existing doc) might not qualify any more under
    // the current rule — e.g. the targeting rule changed, or the overall
    // leader changed and the new leader didn't score on this match. Don't
    // just skip it and leave the stale doc sitting there: remove it, so
    // the homepage's "most recent roast" query doesn't keep surfacing
    // content that no longer reflects how targeting actually works.
    const disqualify = async (reason) => {
      if (existing.exists && force) {
        await roastRef.delete();
        console.log(`  🗑 Global roast removed [${reason}]: ${matchName}`);
      }
    };

    if (ctx.usersByPoints.length === 0) return disqualify("no users");

    // Same tiebreak chain as Leaderboard.jsx (points → tbDistance → exact →
    // name) so "the overall leader" here can never disagree with who's
    // actually shown as #1 on the leaderboard. Only the top slice needs
    // the full tiebreak applied — ctx.usersByPoints is already points-
    // sorted, this just resolves ties at the very top. Sorting a copy of
    // the slice, not ctx.usersByPoints itself, so the league-standings
    // path above keeps its original (points-only) ordering untouched.
    const top = [...ctx.usersByPoints.slice(0, 10)].sort(
      (a, b) =>
        (b.points ?? 0) - (a.points ?? 0) ||
        (a.tbDistance ?? Infinity) - (b.tbDistance ?? Infinity) ||
        (b.exact ?? 0) - (a.exact ?? 0) ||
        nameOf(a).localeCompare(nameOf(b), undefined, { numeric: true, sensitivity: "base" })
    );
    const leader = top[0];

    const leaderPred = preds.find((d) => d.uid === leader.id);
    if (!leaderPred) return disqualify("leader didn't predict this match");

    const [homeScore, awayScore] = finalScore.split("-").map(Number);
    const pts = scorePrediction(leaderPred, homeScore, awayScore);
    if (pts === 0) return disqualify("leader scored 0 on this match"); // keep the roast text honest

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
      targetName:    name,
      targetUid:     leader.id,
      matchName,
      finalScore,
      predictedScore: `${leaderPred.home}-${leaderPred.away}`,
      generatedAt: existing.exists ? existing.data().generatedAt : new Date().toISOString(),
    });

    console.log(`  🔥 Global roast ${existing.exists ? "updated" : "stored"}: ${matchName} → ${name} (overall #1)`);
  } catch (err) {
    console.error("Global roast generation skipped (non-fatal):", err.message);
  }
}
