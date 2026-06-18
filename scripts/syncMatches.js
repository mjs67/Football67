// Syncs fixtures and final scores from football-data.org, then auto-settles
// and recomputes the leaderboard. Run manually or on a schedule (see
// .github/workflows/automation.yml — every 30 minutes).
//
// Env vars:
//   FOOTBALL_DATA_TOKEN   free key from https://www.football-data.org/client/register
//   COMPETITION           competition code, default "PL" (Premier League).
//                         Others: "WC" World Cup, "CL" Champions League,
//                         "EC" Euros, "PD" La Liga, "BL1" Bundesliga, "SA" Serie A
//   DAYS_AHEAD            how far ahead to import fixtures (default 14)
//   GOOGLE_APPLICATION_CREDENTIALS or ./serviceAccount.json for Firestore admin
import { readFileSync, existsSync } from "node:fs";
import admin from "firebase-admin";
import { recomputeLeaderboard } from "./recompute.js";
import { generateRoast } from "../src/roastTemplates.js";

if (existsSync("./serviceAccount.json")) {
  const sa = JSON.parse(readFileSync("./serviceAccount.json", "utf8"));
  admin.initializeApp({ credential: admin.credential.cert(sa) });
} else {
  admin.initializeApp(); // uses GOOGLE_APPLICATION_CREDENTIALS
}
const db = admin.firestore();

const TOKEN = process.env.FOOTBALL_DATA_TOKEN;
if (!TOKEN) {
  console.error("Missing FOOTBALL_DATA_TOKEN env var.");
  process.exit(1);
}
const COMP = process.env.COMPETITION || "PL";
const NEUTRAL_VENUE = ["WC", "EC"].includes(COMP); // tournaments at neutral grounds
const DAYS_AHEAD = Number(process.env.DAYS_AHEAD || (NEUTRAL_VENUE ? 45 : 14));

// One call for the whole season: powers fixtures AND form/H2H stats
const url = `https://api.football-data.org/v4/competitions/${COMP}/matches`;

// Retry transient network failures (dropped sockets, brief 429/5xx) with
// exponential backoff before giving up — flaky connections shouldn't fail a run.
async function fetchWithRetry(u, opts, tries = 4) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const r = await fetch(u, opts);
      if (r.ok) return r;
      // Retry rate-limits and server errors; fail fast on auth/client errors
      if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
      console.error(`football-data.org responded ${r.status}: ${await r.text()}`);
      process.exit(1);
    } catch (e) {
      if (attempt === tries) {
        console.error(`Fetch failed after ${tries} attempts: ${e.message}`);
        process.exit(1);
      }
      const waitMs = 3000 * attempt;
      console.log(`Attempt ${attempt} failed (${e.message}); retrying in ${waitMs / 1000}s…`);
      await new Promise((res) => setTimeout(res, waitMs));
    }
  }
}

const res = await fetchWithRetry(url, { headers: { "X-Auth-Token": TOKEN } });
const data = await res.json();
console.log(`Fetched ${data.matches.length} season matches for ${COMP}.`);

// ── Pre-match stats: last-5 form per team + head-to-head this season ──
const teamName = (t) => t.shortName || t.name;
const finishedSeason = data.matches
  .filter((m) => m.status === "FINISHED")
  .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));

const formMap = new Map(); // team -> array of 'W'|'D'|'L' (chronological)
for (const m of finishedSeason) {
  const h = teamName(m.homeTeam), a = teamName(m.awayTeam);
  const hs = m.score.fullTime.home, as = m.score.fullTime.away;
  const push = (t, r) => formMap.set(t, [...(formMap.get(t) || []), r]);
  if (hs > as) { push(h, "W"); push(a, "L"); }
  else if (hs < as) { push(h, "L"); push(a, "W"); }
  else { push(h, "D"); push(a, "D"); }
}
const lastFive = (t) => (formMap.get(t) || []).slice(-5).join("");

// ── Poisson expected-goals model (powers the odds on every card) ──
// Attack/defence strength per team relative to the competition average,
// shrunk toward neutral when a team has few matches (k=5), so the model
// starts humble on day one of a tournament and sharpens as results land.
const teamStats = new Map(); // team -> {gf, ga, n}
let goalsHomeSide = 0, goalsAwaySide = 0;
for (const m of finishedSeason) {
  const h = teamName(m.homeTeam), a = teamName(m.awayTeam);
  const hs = m.score.fullTime.home, as = m.score.fullTime.away;
  goalsHomeSide += hs;
  goalsAwaySide += as;
  const th = teamStats.get(h) || { gf: 0, ga: 0, n: 0 };
  th.gf += hs; th.ga += as; th.n += 1;
  teamStats.set(h, th);
  const ta = teamStats.get(a) || { gf: 0, ga: 0, n: 0 };
  ta.gf += as; ta.ga += hs; ta.n += 1;
  teamStats.set(a, ta);
}
const N = finishedSeason.length;
// Baseline goals per side per match (sane defaults until results exist)
let gHome = N >= 10 ? goalsHomeSide / N : 1.45;
let gAway = N >= 10 ? goalsAwaySide / N : 1.15;
if (NEUTRAL_VENUE) gHome = gAway = N >= 10 ? (goalsHomeSide + goalsAwaySide) / (2 * N) : 1.3;
const gAvg = (gHome + gAway) / 2;

function strength(team) {
  const s = teamStats.get(team);
  if (!s || s.n === 0) return { att: 1, def: 1, n: 0 };
  const w = s.n / (s.n + 5);
  return {
    att: w * (s.gf / s.n / gAvg) + (1 - w),
    def: w * (s.ga / s.n / gAvg) + (1 - w),
    n: s.n,
  };
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// ── Squad-strength prior (scripts/teamRatings.json) ──
// Elo-style ratings give the model a sensible opinion before any results
// exist; observed tournament data takes over as matches are played.
let ratings = {};
try {
  ratings = JSON.parse(
    readFileSync(new URL("./teamRatings.json", import.meta.url), "utf8")
  );
} catch {
  console.log("No scripts/teamRatings.json found — odds will use match data only.");
}
const DEFAULT_RATING = 1600;
const missingRatings = new Set();
function ratingOf(team) {
  if (Object.prototype.hasOwnProperty.call(ratings, team)) return ratings[team];
  if (Object.keys(ratings).length > 0) missingRatings.add(team);
  return DEFAULT_RATING;
}

function expectedGoals(home, away) {
  const H = strength(home), A = strength(away);
  // Data-driven estimate (form so far this competition/season)
  const dataLh = gHome * H.att * A.def;
  const dataLa = gAway * A.att * H.def;
  // Ratings-driven prior: Elo gap → goal expectancy split
  // (~200-point gap ≈ a 70/30 matchup; +60 home bonus outside neutral venues)
  const diff = ratingOf(home) - ratingOf(away) + (NEUTRAL_VENUE ? 0 : 60);
  const priorLh = gHome * Math.exp(0.002 * diff);
  const priorLa = gAway * Math.exp(-0.002 * diff);
  // Blend: weight shifts from ratings to real results as teams play
  // (each team ~4 matches in → 50/50; ~8 in → two-thirds data)
  const n = H.n + A.n;
  const w = Object.keys(ratings).length > 0 ? n / (n + 8) : 1;
  return {
    lh: Number(clamp(w * dataLh + (1 - w) * priorLh, 0.25, 3.6).toFixed(3)),
    la: Number(clamp(w * dataLa + (1 - w) * priorLa, 0.25, 3.6).toFixed(3)),
    n,
  };
}

function h2h(home, away) {
  let homeWins = 0, draws = 0, awayWins = 0;
  for (const m of finishedSeason) {
    const h = teamName(m.homeTeam), a = teamName(m.awayTeam);
    if (!((h === home && a === away) || (h === away && a === home))) continue;
    const hs = m.score.fullTime.home, as = m.score.fullTime.away;
    if (hs === as) draws++;
    else if ((hs > as ? h : a) === home) homeWins++;
    else awayWins++;
  }
  return homeWins + draws + awayWins > 0 ? { homeWins, draws, awayWins } : null;
}

// Only upsert matches inside the rolling window (recent results + near future).
// Look-back is generous (DAYS_AHEAD, or 21 days min) so finished matches are
// always rewritten with their final scores even if an earlier sync was missed.
const from = Date.now() - Math.max(DAYS_AHEAD, 21) * 86400000;
const to = Date.now() + DAYS_AHEAD * 86400000;
data.matches = data.matches.filter((m) => {
  const t = new Date(m.utcDate).getTime();
  return t >= from && t <= to;
});
console.log(`${data.matches.length} matches inside the ${DAYS_AHEAD}-day window.`);

// Human label for where a match sits in the competition
const STAGE_NAMES = {
  LAST_32: "Round of 32",
  LAST_16: "Round of 16",
  QUARTER_FINALS: "Quarter-finals",
  SEMI_FINALS: "Semi-finals",
  THIRD_PLACE: "Third place",
  FINAL: "Final",
};
function stageLabel(m) {
  if (m.group) return m.group.replace("GROUP_", "Group ");
  if (STAGE_NAMES[m.stage]) return STAGE_NAMES[m.stage];
  return "";
}

// Venue lookup: stadium keyword → "City, Country" (scripts/venues.json)
let venuePlaces = {};
try {
  venuePlaces = JSON.parse(
    readFileSync(new URL("./venues.json", import.meta.url), "utf8")
  );
} catch {
  /* optional file */
}
function venueLabel(m) {
  if (!m.venue) return null;
  const lower = m.venue.toLowerCase();
  for (const [keyword, place] of Object.entries(venuePlaces)) {
    if (keyword.startsWith("_")) continue;
    if (lower.includes(keyword)) return `${m.venue} · ${place}`;
  }
  return m.venue;
}
const compName = (data.competition?.name || COMP).replace(/^FIFA /, "");

let batch = db.batch();
let writes = 0;
let settled = 0;

for (const m of data.matches) {
  const finished = m.status === "FINISHED";
  const live = ["IN_PLAY", "PAUSED"].includes(m.status);
  if (finished) settled++;

  const ref = db.collection("matches").doc(`fd_${m.id}`);
  batch.set(
    ref,
    {
      source: "football-data.org",
      externalId: m.id,
      home: m.homeTeam.shortName || m.homeTeam.name,
      away: m.awayTeam.shortName || m.awayTeam.name,
      homeFlag: m.homeTeam.crest || "⚽",
      awayFlag: m.awayTeam.crest || "⚽",
      competition: stageLabel(m) ? `${compName} · ${stageLabel(m)}` : compName,
      venue: venueLabel(m),
      kickoff: admin.firestore.Timestamp.fromDate(new Date(m.utcDate)),
      status: finished ? "finished" : "upcoming",
      live,
      homeScore: finished ? m.score.fullTime.home : null,
      awayScore: finished ? m.score.fullTime.away : null,
      homeForm: lastFive(m.homeTeam.shortName || m.homeTeam.name),
      awayForm: lastFive(m.awayTeam.shortName || m.awayTeam.name),
      h2h: h2h(m.homeTeam.shortName || m.homeTeam.name, m.awayTeam.shortName || m.awayTeam.name),
      odds: expectedGoals(
        m.homeTeam.shortName || m.homeTeam.name,
        m.awayTeam.shortName || m.awayTeam.name
      ),
    },
    { merge: true }
  );
  if (++writes % 400 === 0) {
    await batch.commit();
    batch = db.batch();
  }
}
await batch.commit();
console.log(`Upserted ${writes} matches (${settled} finished).`);

// Generate roasts for all finished matches in this sync
for (const m of data.matches) {
  if (m.status !== "FINISHED") continue;
  const matchId = `fd_${m.id}`;
  const matchName = `${m.homeTeam.shortName || m.homeTeam.name} v ${m.awayTeam.shortName || m.awayTeam.name}`;
  const finalScore = `${m.score.fullTime.home}-${m.score.fullTime.away}`;
  await generateRoastsForLeagues(matchId, matchName, finalScore);
}
if (missingRatings.size > 0) {
  console.log(
    `No rating found for: ${[...missingRatings].join(", ")} — used default ${DEFAULT_RATING}. ` +
    "Add them to scripts/teamRatings.json (use these exact names)."
  );
}

// ── Roast generation — fires once per finished match, per league ──
async function generateRoastsForLeagues(matchId, matchName, finalScore) {
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
      predsSnap.forEach(doc => {
        const d = doc.data();
        if (!memberUids.includes(d.uid)) return;
        if (d.home == null) return; // no prediction made
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
      });
      if (scorers.length === 0) continue;

      // Get league standings (league members only, ordered by total points)
      const allUsersSnap = await db.collection("users").orderBy("points", "desc").get();
      const leagueStandings = allUsersSnap.docs
        .filter(d => memberUids.includes(d.id))
        .map((d, i) => ({ uid: d.id, rank: i + 1, totalPts: d.data().points || 0 }));

      // Pick roast target: league leader if they scored, otherwise top match scorer
      let target;
      if (scorers.length === 1) {
        target = scorers[0];
      } else {
        const leaderWhoScored = leagueStandings.find(s =>
          scorers.some(sc => sc.uid === s.uid)
        );
        target = scorers.find(sc => sc.uid === leaderWhoScored?.uid)
          ?? scorers.sort((a, b) => b.pts - a.pts)[0];
      }

      const targetStanding = leagueStandings.find(s => s.uid === target.uid);
      const rank = targetStanding?.rank ?? 1;
      const totalPts = targetStanding?.totalPts ?? 0;

      const ordinal = n => {
        const s = ["th", "st", "nd", "rd"];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
      };

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

// ── Auto-pick safety net ──
// Players with autoPickOn get a default 1–1 lodged for any match kicking off
// within the next 40 minutes that they haven't predicted. Runs every sync
// (every 30 min), so nobody with the toggle on ever gets blanked.
const soonSnap = await db
  .collection("matches")
  .where("status", "==", "upcoming")
  .where("kickoff", ">", admin.firestore.Timestamp.now())
  .where("kickoff", "<", admin.firestore.Timestamp.fromMillis(Date.now() + 40 * 60000))
  .get();
if (!soonSnap.empty) {
  const optedIn = await db.collection("users").where("autoPickOn", "==", true).get();
  let autoPicked = 0;
  for (const u of optedIn.docs) {
    for (const m of soonSnap.docs) {
      const ref = db.doc(`predictions/${u.id}_${m.id}`);
      if ((await ref.get()).exists) continue;
      await ref.set({
        uid: u.id,
        matchId: m.id,
        home: 1,
        away: 1,
        autoPicked: true,
        displayName: u.data().displayName || "Anonymous",
        photoURL: u.data().photoURL || "",
        updatedAt: admin.firestore.Timestamp.now(),
      });
      autoPicked++;
    }
  }
  if (autoPicked) console.log(`Auto-picked 1–1 for ${autoPicked} player-matches.`);
}

const players = await recomputeLeaderboard(db);
console.log(`Leaderboard recomputed for ${players} players.`);
process.exit(0);
