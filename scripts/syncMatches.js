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
const DAYS_AHEAD = Number(process.env.DAYS_AHEAD || 14);

// One call for the whole season: powers fixtures AND form/H2H stats
const url = `https://api.football-data.org/v4/competitions/${COMP}/matches`;
const res = await fetch(url, { headers: { "X-Auth-Token": TOKEN } });
if (!res.ok) {
  console.error(`football-data.org responded ${res.status}: ${await res.text()}`);
  process.exit(1);
}
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

// Only upsert matches inside the rolling window (recent results + near future)
const from = Date.now() - 3 * 86400000;
const to = Date.now() + DAYS_AHEAD * 86400000;
data.matches = data.matches.filter((m) => {
  const t = new Date(m.utcDate).getTime();
  return t >= from && t <= to;
});
console.log(`${data.matches.length} matches inside the ${DAYS_AHEAD}-day window.`);

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
      competition:
        (data.competition?.name || COMP) +
        (m.matchday ? ` · MD ${m.matchday}` : ""),
      kickoff: admin.firestore.Timestamp.fromDate(new Date(m.utcDate)),
      status: finished ? "finished" : "upcoming",
      live,
      homeScore: finished ? m.score.fullTime.home : null,
      awayScore: finished ? m.score.fullTime.away : null,
      homeForm: lastFive(m.homeTeam.shortName || m.homeTeam.name),
      awayForm: lastFive(m.awayTeam.shortName || m.awayTeam.name),
      h2h: h2h(m.homeTeam.shortName || m.homeTeam.name, m.awayTeam.shortName || m.awayTeam.name),
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
