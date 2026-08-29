// Shared roast-generation logic. Used by scripts/syncMatches.js (live) and
// scripts/backfillRoasts.js (one-off backfill).
//
// TWO roast systems coexist here (intentionally, during the v2 migration):
//   1. LEGACY winner-roasts — generateRoastsForLeagues / generateGlobalRoast.
//      One roast per match, targeting the best scorer / overall #1. Feeds the
//      current homepage hero (globalRoasts) and per-league boards
//      (groups/{id}/matchRoasts). Left running so nothing on the live app breaks.
//   2. v2 PER-PREDICTION roasts — generatePredictionRoasts. At settlement, every
//      prediction with a roastTrigger (§5.1) gets its own roasts/{id} doc from
//      the reviewed bank (roastBank.js). This is what the new public feed (§6)
//      reads. It also stamps roastTrigger back onto the prediction.
//
// Scoring runs through the one canonical scorer (../src/scoring.js).
import { generateRoast } from "./roastTemplates.js";
import { scorePoints, classifyRoastTrigger, outcomeOf } from "../src/scoring.js";
import { predict1x2, matchProbs } from "../src/poisson.js";
import { templatesFor } from "./roastBank.js";
import { compareStandings } from "../src/standings.js";

// PUBLIC name resolver (§14.1): roasts are public, so they must NEVER show a
// user's Google displayName — only their self-chosen handle (nickname). Users
// without a handle (e.g. legacy players from before forced onboarding) get a
// stable, non-identifying "Anon-xxxx" derived from their uid, so the feed
// stays populated without exposing a real name. displayName is deliberately
// never consulted here.
function anonLabel(uid) {
  let h = 5381;
  for (let i = 0; i < uid.length; i++) h = (h * 33) ^ uid.charCodeAt(i);
  return "Anon-" + (h >>> 0).toString(36).slice(0, 4);
}
function publicHandleOf(user, uid) {
  const nick = (user?.nickname || "").trim();
  return nick.length >= 3 ? nick : anonLabel(uid);
}

function pointsFor(pred, finalScore, match) {
  const [homeScore, awayScore] = finalScore.split("-").map(Number);
  const m = { status: "finished", homeScore, awayScore };
  return scorePoints({ home: pred.home, away: pred.away }, m);
}

export async function buildRoastContext(db) {
  const [leaguesSnap, usersSnap] = await Promise.all([
    db.collection("groups").get(),
    db.collection("users").orderBy("points", "desc").get(),
  ]);
  const leagues = leaguesSnap.docs.map((d) => ({ id: d.id, members: d.data().members || [] }));
  const usersByPoints = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const usersById = new Map(usersByPoints.map((u) => [u.id, u]));
  return { leagues, usersByPoints, usersById };
}

// ── v2 per-prediction roasts (§5.1–5.3) ──────────────────────────────
// Base brutality per trigger (0–100); severity + streak nudge it. Community
// reactions raise it later (updated when reactions land — not here).
const TRIGGER_WEIGHT = {
  BANKER_HIT: 90, CONFIDENT_WRONG: 85, EXACT: 78, MODEL_DEFIER: 70,
  UPSET: 66, CONTRARIAN_WRONG: 60, STREAK_N: 55, COWARD: 40,
};

// Deterministic, well-spread template choice (djb2 over a per-roast key), so
// re-running settlement yields the SAME roast for a prediction (idempotent)
// while different predictions spread across the bank.
function pickTemplate(list, key) {
  if (!list.length) return null;
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = (h * 33) ^ key.charCodeAt(i);
  return list[(h >>> 0) % list.length];
}

function fillSlots(tpl, s) {
  return tpl
    .replace(/{name}/g, s.name)
    .replace(/{match}/g, s.match)
    .replace(/{score}/g, s.score)
    .replace(/{predScore}/g, s.predScore)
    .replace(/{streakN}/g, s.streakN);
}

function brutalScoreFor(trigger, severity, streakN) {
  let v = TRIGGER_WEIGHT[trigger] ?? 40;
  if (severity === "savage") v += 12;
  if (trigger === "STREAK_N") v += Math.min(10, Number(streakN) || 0);
  return Math.max(0, Math.min(100, v));
}

// Fires once per match at settlement. For every prediction: classify the
// trigger, stamp it on the prediction, and — when the trigger isn't null —
// write a roasts/{userId}_{matchId} doc from the reviewed bank. Non-fatal.
export async function generatePredictionRoasts(db, ctx, matchId, matchName, finalScore, preds) {
  try {
    if (!preds || preds.length === 0) return;
    const mSnap = await db.collection("matches").doc(matchId).get();
    if (!mSnap.exists) return;
    const m = mSnap.data();
    if (m.status !== "finished" || m.homeScore == null || m.awayScore == null) return;

    // Consensus: prefer what recompute stored; else derive from preds.
    let consensus = m.consensus || null;
    if (!consensus) {
      const t = { h: 0, d: 0, a: 0 };
      for (const p of preds) {
        const oc = p.outcome || outcomeOf(p.home, p.away);
        if (oc === "1") t.h++; else if (oc === "X") t.d++; else t.a++;
      }
      const div = t.h + t.d + t.a || 1;
      consensus = {
        pctHome: Math.round((t.h / div) * 100),
        pctDraw: Math.round((t.d / div) * 100),
        pctAway: Math.round((t.a / div) * 100),
      };
    }

    // Model most / least likely from frozen pre-match odds.
    let modelPick = null, modelLeast = null;
    if (m.odds && m.odds.lh != null && m.odds.la != null) {
      modelPick = { H: "1", D: "X", A: "2" }[predict1x2(m.odds.lh, m.odds.la)];
      const { ph, pd, pa } = matchProbs(m.odds.lh, m.odds.la);
      modelLeast = [["1", ph], ["X", pd], ["2", pa]].sort((a, b) => a[1] - b[1])[0][0];
    }

    const leagueId = m.leagueId || "epl";
    let made = 0;

    for (const p of preds) {
      if (!p.uid) continue;
      const predId = `${p.uid}_${matchId}`;
      const u = ctx.usersById.get(p.uid);
      const streak = u?.streak ?? 0;

      const trigger = classifyRoastTrigger(
        { home: p.home, away: p.away, outcome: p.outcome, scoreExact: p.scoreExact, isBanker: p.isBanker },
        m,
        { consensus, streak, modelPick, modelLeast }
      );

      // Always keep the prediction's stamped trigger in sync.
      await db.doc(`predictions/${predId}`).set({ roastTrigger: trigger ?? null }, { merge: true });

      // Unremarkable pick → no roast doc.
      if (!trigger) continue;

      const severity = u?.savageDefault === true ? "savage" : "cheeky";
      const isPublic = u?.settings?.publicRoasts !== false; // default public unless opted out
      const name = publicHandleOf(u, p.uid);
      const tpl = pickTemplate(templatesFor(trigger, severity), predId + trigger + severity);
      if (!tpl) continue;

      const text = fillSlots(tpl, {
        name, match: matchName, score: finalScore,
        predScore: `${p.home}-${p.away}`, streakN: streak,
      });

      // Preserve community state (reactions/shareCount/createdAt) across re-runs:
      // initialise them only when the roast is first created.
      const roastRef = db.doc(`roasts/${predId}`);
      const existing = await roastRef.get();
      const docFields = {
        userId: p.uid, predictionId: predId, fixtureId: matchId,
        leagueId, groupId: null, trigger, severity, text,
        brutalScore: brutalScoreFor(trigger, severity, streak),
        public: isPublic, locked: false, // rewarded-reveal lock lands with §8.1
        targetName: name, matchName, finalScore, deleted: false,
      };
      if (!existing.exists) {
        docFields.reactions = { fire: 0, skull: 0, sob: 0, yawn: 0 };
        docFields.shareCount = 0;
        docFields.createdAt = new Date().toISOString();
      }
      await roastRef.set(docFields, { merge: true });
      made++;
    }
    console.log(`  🔥 v2 roasts: ${made} generated for ${matchId} (${preds.length} prediction(s))`);
  } catch (err) {
    console.error("Prediction-roast generation skipped (non-fatal):", err.message);
  }
}

// ── Legacy: pick best scorer as the single match target ──────────────
export function pickRoastTarget(scorers, standings) {
  if (scorers.length === 1) return scorers[0];
  const bestPts = Math.max(...scorers.map((sc) => sc.pts));
  const topScorers = scorers.filter((sc) => sc.pts === bestPts);
  if (topScorers.length === 1) return topScorers[0];
  const highestRanked = standings.find((s) => topScorers.some((sc) => sc.uid === s.uid));
  return topScorers.find((sc) => sc.uid === highestRanked?.uid) ?? topScorers[0];
}

export const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export async function generateRoastsForLeagues(db, ctx, matchId, matchName, finalScore, preds, { force = false } = {}, match = null) {
  try {
    if (ctx.leagues.length === 0 || preds.length === 0) return;
    for (const league of ctx.leagues) {
      const roastRef = db.collection("groups").doc(league.id).collection("matchRoasts").doc(matchId);
      const existingRoast = await roastRef.get();
      if (existingRoast.exists && !force) continue;
      const memberUids = league.members;
      if (memberUids.length === 0) continue;

      const scorers = [];
      for (const d of preds) {
        if (!memberUids.includes(d.uid)) continue;
        const pts = pointsFor(d, finalScore, match);
        if (pts > 0) {
          const u = ctx.usersById.get(d.uid);
          const name = publicHandleOf(u, d.uid);
          scorers.push({ uid: d.uid, name, pts });
        }
      }
      if (scorers.length === 0) continue;

      const leagueStandings = ctx.usersByPoints
        .filter((u) => memberUids.includes(u.id))
        .map((u, i) => ({ uid: u.id, rank: i + 1, totalPts: u.points || 0 }));

      const target = pickRoastTarget(scorers, leagueStandings);
      const targetStanding = leagueStandings.find((s) => s.uid === target.uid);
      const rank = targetStanding?.rank ?? 1;
      const totalPts = targetStanding?.totalPts ?? 0;

      const roastText = generateRoast({
        matchId, name: target.name, pts: target.pts, match: matchName,
        score: finalScore, leaguePos: ordinal(rank), totalPts,
      });

      await roastRef.set({
        roastText, targetName: target.name, targetUid: target.uid, matchName, finalScore,
        generatedAt: existingRoast.exists ? existingRoast.data().generatedAt : new Date().toISOString(),
      });
      console.log(`  🔥 Roast ${existingRoast.exists ? "updated" : "stored"} [${league.id}] ${matchName} → ${target.name}`);
    }
  } catch (err) {
    console.error("Roast generation skipped (non-fatal):", err.message);
  }
}

export async function generateGlobalRoast(db, ctx, matchId, matchName, finalScore, preds, { force = false } = {}, match = null) {
  try {
    const roastRef = db.collection("globalRoasts").doc(matchId);
    const existing = await roastRef.get();
    if (existing.exists && !force) return;

    const disqualify = async (reason) => {
      if (existing.exists && force) {
        await roastRef.delete();
        console.log(`  🗑 Global roast removed [${reason}]: ${matchName}`);
      }
    };
    if (ctx.usersByPoints.length === 0) return disqualify("no users");

    const top = [...ctx.usersByPoints.slice(0, 10)].sort((a, b) => compareStandings(a, b));
    const leader = top[0];
    const leaderPred = preds.find((d) => d.uid === leader.id);
    if (!leaderPred) return disqualify("leader didn't predict this match");
    const pts = pointsFor(leaderPred, finalScore, match);
    if (pts === 0) return disqualify("leader scored 0 on this match");

    const name = publicHandleOf(leader, leader.id);
    const totalPts = leader.points || 0;
    const roastText = generateRoast({
      matchId, name, pts, match: matchName, score: finalScore, leaguePos: ordinal(1), totalPts,
    });

    await roastRef.set({
      roastText, targetName: name, targetUid: leader.id, matchName, finalScore,
      predictedScore: `${leaderPred.home}-${leaderPred.away}`,
      generatedAt: existing.exists ? existing.data().generatedAt : new Date().toISOString(),
    });
    console.log(`  🔥 Global roast ${existing.exists ? "updated" : "stored"}: ${matchName} → ${name} (overall #1)`);
  } catch (err) {
    console.error("Global roast generation skipped (non-fatal):", err.message);
  }
}
