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
import { readFileSync } from "node:fs";
import { db, admin } from "./admin.js";
import { recomputeLeaderboard } from "./recompute.js";
import { buildRoastContext, generateRoastsForLeagues, generateGlobalRoast } from "./roastGeneration.js";
import { venueFromSchedule } from "./wc2026Venues.js";
import { KO_STAGE_ORDER, STAGE_NAMES, teamName, stageLabel } from "./stages.js";

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

// Keep the FULL season match list (before any windowing) so knockout bracket
// slot numbering is stable — slots are assigned by a match's position within
// its entire stage, which must not shift just because some matches fall
// outside the rolling import window below.
const allSeasonMatches = data.matches.slice();

// ── Pre-match stats: last-5 form per team + head-to-head this season ──
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

// Human label for where a match sits in the competition comes from
// stages.js (stageLabel/STAGE_NAMES), shared with scripts/bracket.js.

// ── Machine-readable knockout tagging ──
// The bracket derives team eliminations straight from the `matches`
// collection (single source of truth — no separate results map). For that
// it needs each knockout match tagged with its round index and bracket slot.
// football-data.org returns knockout matches in bracket order, so the slot =
// the match's position (by kickoff) within its stage. Built from the full
// season list so numbering is stable regardless of the import window.
//
// Round index is RELATIVE to the bracket's first knockout stage (mirrors
// scripts/bracket.js `auto`): LAST_16 is round 0 for a 16-team bracket but
// round 1 for a 32-team bracket.
// (KO_STAGE_ORDER lives in stages.js, shared with scripts/bracket.js.)
const koStagesPresent = KO_STAGE_ORDER.filter((s) =>
  allSeasonMatches.some((m) => m.stage === s)
);
const firstKoStageIdx = koStagesPresent.length
  ? KO_STAGE_ORDER.indexOf(koStagesPresent[0])
  : -1;

const koTags = new Map(); // externalId -> { round, bracketSlot }
if (firstKoStageIdx >= 0) {
  for (let s = firstKoStageIdx; s < KO_STAGE_ORDER.length; s++) {
    const stage = KO_STAGE_ORDER[s];
    const round = s - firstKoStageIdx;
    const stageMatches = allSeasonMatches
      .filter((m) => m.stage === stage)
      .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
    stageMatches.forEach((m, i) => {
      koTags.set(m.id, { round, bracketSlot: `r${round}-${i}` });
    });
  }
}

// phase/round/slot for a match. Group matches carry phase only; the
// third-place playoff is knockout-phase but has no bracket slot.
function knockoutFields(m) {
  if (m.group) return { phase: "group", round: null, bracketSlot: null };
  const tag = koTags.get(m.id);
  if (tag) return { phase: "knockout", round: tag.round, bracketSlot: tag.bracketSlot };
  if (STAGE_NAMES[m.stage]) return { phase: "knockout", round: null, bracketSlot: null };
  return { phase: "group", round: null, bracketSlot: null };
}

// Which team advanced from a finished knockout match. football-data.org
// reports the full-time score as level when a tie is settled by extra time
// or penalties, exposing the actual winner via score.winner (HOME_TEAM /
// AWAY_TEAM). We resolve to a team name so the bracket never stalls on a
// drawn-but-decided knockout (e.g. a penalty shootout).
function advancingTeam(m) {
  if (m.status !== "FINISHED") return null;
  const home = teamName(m.homeTeam);
  const away = teamName(m.awayTeam);
  const w = m.score?.winner;
  if (w === "HOME_TEAM") return home;
  if (w === "AWAY_TEAM") return away;
  const hs = m.score?.fullTime?.home, as = m.score?.fullTime?.away;
  if (hs != null && as != null && hs !== as) return hs > as ? home : away;
  return null; // genuinely undecided
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
  // football-data.org doesn't return a `venue` field for WC2026 matches at
  // all (confirmed 104/104) — fall back to the static FIFA schedule, matched
  // by kickoff time (+ teams where known), before giving up.
  const raw =
    m.venue ||
    venueFromSchedule(
      teamName(m.homeTeam),
      teamName(m.awayTeam),
      m.utcDate
    );
  if (!raw) return null;
  const lower = raw.toLowerCase();
  for (const [keyword, place] of Object.entries(venuePlaces)) {
    if (keyword.startsWith("_")) continue;
    if (lower.includes(keyword)) return `${raw} · ${place}`;
  }
  return raw;
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
  const ko = knockoutFields(m);
  const home = teamName(m.homeTeam);
  const away = teamName(m.awayTeam);
  batch.set(
    ref,
    {
      source: "football-data.org",
      externalId: m.id,
      home,
      away,
      homeFlag: m.homeTeam.crest || "⚽",
      awayFlag: m.awayTeam.crest || "⚽",
      competition: stageLabel(m) ? `${compName} · ${stageLabel(m)}` : compName,
      // Machine-readable phase/bracket tags — drive leaderboard phase buckets
      // (recompute.js phaseOf) and the bracket's elimination detection.
      phase: ko.phase,
      round: ko.round,
      bracketSlot: ko.bracketSlot,
      // For knockout slots: the team that advanced (handles ET/penalties,
      // where the full-time score is level). Null for group/undecided.
      advancedTeam: ko.bracketSlot ? advancingTeam(m) : null,
      venue: venueLabel(m),
      kickoff: admin.firestore.Timestamp.fromDate(new Date(m.utcDate)),
      status: finished ? "finished" : "upcoming",
      live,
      homeScore: finished ? m.score.fullTime.home : null,
      awayScore: finished ? m.score.fullTime.away : null,
      homeForm: lastFive(home),
      awayForm: lastFive(away),
      h2h: h2h(home, away),
      odds: expectedGoals(home, away),
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

// Recompute the leaderboard now, BEFORE generating roasts — not at the end
// of the script like before. The homepage roast (generateGlobalRoast,
// below) targets whoever is #1 on the overall leaderboard, so that check
// has to run against standings that already include the matches that just
// finished in this sync. Recomputing afterward would let the homepage
// roast lag a full sync cycle behind the actual leader.
const playersAfterSync = await recomputeLeaderboard(db);
console.log(`Leaderboard recomputed for ${playersAfterSync} players.`);

// Generate roasts for every match that finished in this sync — both the
// per-league roasts (unchanged logic) and the homepage's site-wide roast.
// The global roast always targets the CURRENT overall #1 (re-checked here,
// per finished match, against the leaderboard just recomputed above) —
// not necessarily the same person from the last roast.
const finishedThisSync = data.matches.filter((m) => m.status === "FINISHED");
if (finishedThisSync.length > 0) {
  const roastCtx = await buildRoastContext(db);
  for (const m of finishedThisSync) {
    const matchId = `fd_${m.id}`;
    const home = teamName(m.homeTeam);
    const away = teamName(m.awayTeam);
    const matchName = `${home} v ${away}`;
    const finalScore = `${m.score.fullTime.home}-${m.score.fullTime.away}`;
    const predsSnap = await db
      .collection("predictions")
      .where("matchId", "==", matchId)
      .get();
    const preds = predsSnap.docs.map((d) => d.data());
    await generateRoastsForLeagues(db, roastCtx, matchId, matchName, finalScore, preds, {});
    await generateGlobalRoast(db, roastCtx, matchId, matchName, finalScore, preds, {});
  }
}

if (missingRatings.size > 0) {
  console.log(
    `No rating found for: ${[...missingRatings].join(", ")} — used default ${DEFAULT_RATING}. ` +
    "Add them to scripts/teamRatings.json (use these exact names)."
  );
}

// ── Auto-pick safety net ──
// Players with autoPickOn get a default 1–1 lodged for any match kicking off
// within the next 40 minutes (or already underway but not yet settled) that
// they haven't predicted. Deliberately has no lower bound on kickoff: GitHub
// Actions' `schedule:` trigger has no timing SLA and a sync can also fail
// outright (see fetchWithRetry's process.exit on persistent errors), so a
// run can land after a match has already kicked off. Without a lower bound,
// the *next* successful run still catches it as long as the match is still
// "upcoming" (i.e. not yet reported FINISHED) — a lower bound here meant a
// single missed/delayed run could permanently skip a match for autopick
// users, since once kickoff < now they'd never satisfy "kickoff > now"
// again on any later run.
const soonSnap = await db
  .collection("matches")
  .where("status", "==", "upcoming")
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

process.exit(0);
