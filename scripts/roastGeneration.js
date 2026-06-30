// Shared roast-generation logic. Used by both scripts/syncMatches.js (live,
// runs on whatever's in the current rolling sync window) and
// scripts/backfillRoasts.js (one-off, runs against every finished match in
// Firestore regardless of how old it is). Keeping this in one place means
// the two can never drift out of sync on targeting logic.
//
// Scoring note: roasts now score through the SAME canonical scorer as the
// leaderboard and the app (../src/scoring.js), so knockout points stack
// correctly (exact +5, result +3, advancer +2, up to 10). Previously this
// file carried its own simplified 5/3/0 scorer with no knockout awareness,
// which could mis-target a knockout roast and understate "+{pts}". Callers
// pass the finished match (phase + advancedTeam) so the knockout path can
// run; when omitted, scoring falls back to group rules (old behaviour).
//
// Read efficiency: buildRoastContext() fetches the leagues list and the
// full users collection ONCE per script run, not once per match.
import { generateRoast } from "./roastTemplates.js";
import { scorePoints, phaseOf } from "../src/scoring.js";
import { displayNameOf } from "../src/nameUtils.js";
import { compareStandings } from "../src/standings.js";

const nameOf = (r) => displayNameOf(r, "Unknown");

// Score a prediction for roast purposes against the finished match. `match`
// carries phase/advancedTeam/home/away so knockout stacking applies; when
// null we score under group rules (safe fallback to the old behaviour).
function pointsFor(pred, finalScore, match) {
  const [homeScore, awayScore] = finalScore.split("-").map(Number);
  const m = {
    status: "finished",
    homeScore,
    awayScore,
    home: match?.home,
    away: match?.away,
    advancedTeam: match?.advancedTeam ?? null,
    phase: match ? match.phase ?? phaseOf(match) : "group",
  };
  return scorePoints({ home: pred.home, away: pred.away, advance: pred.advance }, m);
}

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

// ── Per-league roast — fires once per finished match, per league ──
// `preds` is the already-fetched array of prediction data for this match,
// fetched once by the caller and shared with generateGlobalRoast. `match`
// (optional) is the finished match doc, used for knockout-aware scoring.
export async function generateRoastsForLeagues(db, ctx, matchId, matchName, finalScore, preds, { force = false } = {}, match = null) {
  try {
    if (ctx.leagues.length === 0 || preds.length === 0) return;

    for (const league of ctx.leagues) {
      const roastRef = db
        .collection("groups").doc(league.id)
        .collection("matchRoasts").doc(matchId);
      const existingRoast = await roastRef.get();
      // Normally: skip if already generated. With force=true (used by the
      // backfill script's --force mode), recompute and overwrite anyway.
      if (existingRoast.exists && !force) continue;

      const memberUids = league.members;
      if (memberUids.length === 0) continue;

      // Filter to league members who scored points on this match
      const scorers = [];
      for (const d of preds) {
        if (!memberUids.includes(d.uid)) continue;
        const pts = pointsFor(d, finalScore, match);
        if (pts > 0) {
          const u = ctx.usersById.get(d.uid);
          const name = u ? nameOf(u) : (d.displayName || "Unknown");
          scorers.push({ uid: d.uid, name, pts });
        }
      }
      if (scorers.length === 0) continue;

      // League standings (members only), same ordering as before — sourced
      // from the cached, points-sorted user list now instead of a fresh query.
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
        // re-running --force doesn't scramble "most recent roast" ordering.
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
// homepage hero. Always targets the current #1 OVERALL leaderboard player,
// but only fires for a match where that leader actually scored points on it.
export async function generateGlobalRoast(db, ctx, matchId, matchName, finalScore, preds, { force = false } = {}, match = null) {
  try {
    const roastRef = db.collection("globalRoasts").doc(matchId);
    const existing = await roastRef.get();
    if (existing.exists && !force) return;

    // On a forced regenerate, a match that USED to qualify might not any
    // more — remove the stale doc rather than leaving it to surface on the
    // homepage's "most recent roast" query.
    const disqualify = async (reason) => {
      if (existing.exists && force) {
        await roastRef.delete();
        console.log(`  🗑 Global roast removed [${reason}]: ${matchName}`);
      }
    };

    if (ctx.usersByPoints.length === 0) return disqualify("no users");

    // Same tiebreak chain as the Leaderboard (shared standings.js comparator)
    // so "the overall leader" here can never disagree with who's shown as #1.
    // Only the top slice needs the full tiebreak; sorting a copy so the
    // league-standings path keeps its original points-only ordering.
    const top = [...ctx.usersByPoints.slice(0, 10)].sort((a, b) => compareStandings(a, b));
    const leader = top[0];

    const leaderPred = preds.find((d) => d.uid === leader.id);
    if (!leaderPred) return disqualify("leader didn't predict this match");

    const pts = pointsFor(leaderPred, finalScore, match);
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
