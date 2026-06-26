// Manage the knockout bracket predictor.
//
// Auto-create from football-data.org API (once group stage is done):
//   FOOTBALL_DATA_TOKEN=xxx COMPETITION=WC node scripts/bracket.js auto
//
//   Reads the Round of 16 matches from the API, extracts teams + kickoff
//   times, and creates the bracket automatically. Per-round deadlines are
//   set to 1 hour before each round's first match kickoff.
//
// Manual create (4, 8, 16 or 32 teams in bracket order — pair 1 vs 2, 3 vs 4, …):
//   node scripts/bracket.js create \
//     --deadline-r0 2026-06-28T16:00:00Z \
//     --deadline-r1 2026-07-04T12:00:00Z \
//     --deadline-r2 2026-07-08T12:00:00Z \
//     --deadline-r3 2026-07-14T18:00:00Z \
//     "France,Argentina,Brazil,England,Spain,Germany,Portugal,Netherlands"
//
//   Shorthand: if all rounds share one deadline (old behaviour), use --deadline:
//   node scripts/bracket.js create --deadline 2026-06-28T16:00:00Z "France,..."
//
// Record a real winner as the tournament progresses (re-ranks everyone):
//   node scripts/bracket.js result r0-2 "Spain"
//
//   Match ids: r0-N = first round, r1-N = next round, … (shown by `status`)
//
// Other commands:
//   node scripts/bracket.js status     → print the bracket + recorded results
//   node scripts/bracket.js clear      → delete the bracket
import { readFileSync, existsSync } from "node:fs";
import admin from "firebase-admin";
import { recomputeLeaderboard } from "./recompute.js";

if (existsSync("./serviceAccount.json")) {
  const sa = JSON.parse(readFileSync("./serviceAccount.json", "utf8"));
  admin.initializeApp({ credential: admin.credential.cert(sa) });
} else {
  admin.initializeApp();
}
const db = admin.firestore();
const ref = db.doc("settings/bracket");

const args = process.argv.slice(2);
const cmd = args[0];

// Points per correct pick, by bracket size and round
const POINTS = { 4: [4, 10], 8: [3, 6, 10], 16: [2, 4, 6, 10], 32: [1, 2, 4, 6, 10] };

// football-data.org stage codes → bracket round index
const STAGE_TO_ROUND = {
  LAST_32:       0,
  LAST_16:       0,  // for a 16-team bracket, R16 is round 0
  QUARTER_FINALS: 1,
  SEMI_FINALS:   2,
  FINAL:         3,
};

// Which stage is the first round for each bracket size
const FIRST_STAGE = {
  32: "LAST_32",
  16: "LAST_16",
  8:  "QUARTER_FINALS",
  4:  "SEMI_FINALS",
};

// Parse --flag value from args, returning the value string or null
function getFlag(flag) {
  const idx = args.indexOf(flag);
  return idx > -1 && args[idx + 1] ? args[idx + 1] : null;
}

// Strip all known flags and their values from args to isolate the teams string
function stripFlags(arr, flags) {
  const out = [];
  let skip = false;
  for (let i = 0; i < arr.length; i++) {
    if (flags.includes(arr[i])) { skip = true; continue; }
    if (skip) { skip = false; continue; }
    out.push(arr[i]);
  }
  return out;
}

// Write the bracket document to Firestore
async function writeBracket(teams, roundDeadlines) {
  const rounds = Math.log2(teams.length);
  const deadlinesMap = {};
  for (let r = 0; r < rounds; r++) {
    deadlinesMap[String(r)] = admin.firestore.Timestamp.fromDate(roundDeadlines[r]);
  }
  const earliestDeadline = roundDeadlines.reduce((a, b) => (a < b ? a : b));
  await ref.set({
    teams,
    rounds,
    points: POINTS[teams.length],
    deadline: admin.firestore.Timestamp.fromDate(earliestDeadline),
    deadlines: deadlinesMap,
    results: {},
  });
  console.log(`Bracket created: ${teams.length} teams, ${rounds} rounds.`);
  console.log(`Points per correct pick by round: ${POINTS[teams.length].join(" / ")}`);
  console.log(`Per-round deadlines:`);
  for (let r = 0; r < rounds; r++) {
    console.log(`  Round ${r} locks at ${roundDeadlines[r].toISOString()}`);
  }
}

if (cmd === "auto") {
  // ── Auto-create bracket from football-data.org API ──────────────
  const TOKEN = process.env.FOOTBALL_DATA_TOKEN;
  if (!TOKEN) {
    console.error("Missing FOOTBALL_DATA_TOKEN env var.");
    process.exit(1);
  }
  const COMP = process.env.COMPETITION || "WC";
  const url = `https://api.football-data.org/v4/competitions/${COMP}/matches`;

  console.log(`Fetching matches from football-data.org (${COMP})…`);
  const res = await fetch(url, { headers: { "X-Auth-Token": TOKEN } });
  if (!res.ok) {
    console.error(`API error ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const data = await res.json();
  const teamName = (t) => t.shortName || t.name;

  // Determine bracket size: find the earliest knockout stage with known teams
  // Prefer LAST_16 for a standard WC (32→16 teams). Fall back to whatever
  // stage has populated team names.
  const knockoutStages = ["LAST_32", "LAST_16", "QUARTER_FINALS", "SEMI_FINALS"];
  let firstStageMatches = [];
  let detectedSize = null;

  for (const stage of knockoutStages) {
    const stageMatches = data.matches
      .filter((m) => m.stage === stage)
      .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));

    if (stageMatches.length === 0) continue;

    // Check if teams are known (not TBD/null)
    const hasTeams = stageMatches.every(
      (m) => m.homeTeam?.name && m.awayTeam?.name
        && m.homeTeam.name !== "TBD" && m.awayTeam.name !== "TBD"
    );

    if (hasTeams) {
      firstStageMatches = stageMatches;
      detectedSize = firstStageMatches.length * 2;
      console.log(`Detected ${detectedSize}-team bracket (stage: ${stage}, ${firstStageMatches.length} matches).`);
      break;
    } else {
      console.log(`Stage ${stage} has ${stageMatches.length} matches but teams not confirmed yet.`);
    }
  }

  if (!firstStageMatches.length) {
    console.error(
      "No knockout stage has confirmed teams yet — group stage may still be in progress.\n" +
      "Run `auto` again once the group stage is complete."
    );
    process.exit(1);
  }

  // Extract teams in bracket order: home, away, home, away, …
  // football-data.org returns matches in bracket order already.
  const teams = firstStageMatches.flatMap((m) => [
    teamName(m.homeTeam),
    teamName(m.awayTeam),
  ]);

  console.log(`Teams (${teams.length}): ${teams.join(", ")}`);

  // Build per-round deadlines: 1 hour before first match of each round.
  // We derive this from the API's match schedule for each stage.
  const rounds = Math.log2(teams.length);
  const roundDeadlines = [];

  // Map round index → API stage name (relative to detected first stage)
  const stageOrder = ["LAST_32", "LAST_16", "QUARTER_FINALS", "SEMI_FINALS", "FINAL"];
  const firstStageIdx = stageOrder.indexOf(
    knockoutStages.find((s) => firstStageMatches[0]?.stage === s) ||
    (detectedSize === 16 ? "LAST_16" : "QUARTER_FINALS")
  );

  for (let r = 0; r < rounds; r++) {
    const stageName = stageOrder[firstStageIdx + r];
    const stageMs = data.matches
      .filter((m) => m.stage === stageName)
      .map((m) => new Date(m.utcDate).getTime())
      .filter(Boolean);

    if (stageMs.length === 0) {
      console.error(`No matches found for stage ${stageName} (round ${r}). Cannot set deadline.`);
      process.exit(1);
    }

    // Deadline = 1 hour before the earliest kickoff in that round
    const earliest = Math.min(...stageMs);
    roundDeadlines.push(new Date(earliest - 60 * 60 * 1000));
    console.log(`Round ${r} (${stageName}): first kickoff ${new Date(earliest).toISOString()}, deadline ${roundDeadlines[r].toISOString()}`);
  }

  // Confirm before writing
  const existing = await ref.get();
  if (existing.exists) {
    console.log("\n⚠️  A bracket already exists. It will be overwritten.");
    console.log(`Existing teams: ${existing.data().teams?.join(", ")}`);
  }

  await writeBracket(teams, roundDeadlines);

} else if (cmd === "create") {
  const knownFlags = ["--deadline", "--deadline-r0", "--deadline-r1", "--deadline-r2", "--deadline-r3"];

  const dlR0 = getFlag("--deadline-r0");
  const dlR1 = getFlag("--deadline-r1");
  const dlR2 = getFlag("--deadline-r2");
  const dlR3 = getFlag("--deadline-r3");
  const dlLegacy = getFlag("--deadline");

  function resolveDeadline(perRound) {
    const raw = perRound || dlLegacy;
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d) ? null : d;
  }

  const teamsRaw = stripFlags(args.slice(1), knownFlags).join(" ");
  const teams = teamsRaw.split(",").map((t) => t.trim()).filter(Boolean);

  if (![4, 8, 16, 32].includes(teams.length)) {
    console.error(`Need exactly 4, 8, 16 or 32 teams (got ${teams.length}).`);
    process.exit(1);
  }

  const rounds = Math.log2(teams.length);
  const roundDeadlines = Array.from({ length: rounds }, (_, r) => {
    return resolveDeadline([dlR0, dlR1, dlR2, dlR3][r]);
  });

  const missingIdx = roundDeadlines.findIndex((d) => !d);
  if (missingIdx !== -1) {
    console.error(
      `Missing deadline for round ${missingIdx}.\n` +
      `Provide --deadline-r${missingIdx} <ISO date>, or use --deadline to set all rounds.`
    );
    process.exit(1);
  }

  await writeBracket(teams, roundDeadlines);

} else if (cmd === "result") {
  const [, matchId, ...teamParts] = args;
  const team = teamParts.join(" ").trim();
  if (!matchId || !team) {
    console.error('Usage: node scripts/bracket.js result <matchId> "<Team>"');
    process.exit(1);
  }
  const snap = await ref.get();
  if (!snap.exists) {
    console.error("No bracket exists. Run `auto` or `create` first.");
    process.exit(1);
  }
  if (!snap.data().teams.includes(team)) {
    console.error(`"${team}" is not one of the bracket teams.`);
    process.exit(1);
  }
  await ref.update({ [`results.${matchId}`]: team });
  const n = await recomputeLeaderboard(db);
  console.log(`Recorded ${team} winning ${matchId}. Leaderboard re-ranked for ${n} players.`);

} else if (cmd === "status") {
  const snap = await ref.get();
  if (!snap.exists) {
    console.log("No bracket set.");
  } else {
    const b = snap.data();
    console.log(`Teams (${b.teams.length}): ${b.teams.join(", ")}`);
    if (b.deadlines) {
      console.log(`Per-round deadlines:`);
      for (let r = 0; r < b.rounds; r++) {
        const dl = b.deadlines[String(r)];
        console.log(`  Round ${r}: ${dl ? dl.toDate().toISOString() : "not set"}`);
      }
    } else {
      console.log(`Deadline (all rounds): ${b.deadline.toDate().toISOString()}`);
    }
    let matches = b.teams.length / 2;
    for (let r = 0; r < b.rounds; r++) {
      const ids = Array.from({ length: matches }, (_, i) => {
        const id = `r${r}-${i}`;
        return `${id}${b.results[id] ? ` → ${b.results[id]}` : ""}`;
      });
      console.log(`Round ${r} (+${b.points[r]} pts): ${ids.join("  ")}`);
      matches /= 2;
    }
  }

} else if (cmd === "clear") {
  await ref.delete();
  const n = await recomputeLeaderboard(db);
  console.log(`Bracket cleared. Leaderboard re-ranked for ${n} players.`);

} else {
  console.log(
    "Commands:\n" +
    "  auto                                            auto-create from API (recommended)\n" +
    "  create --deadline-r0 <ISO> … \"<t1,t2,…>\"       manual create\n" +
    "  create --deadline <ISO> \"<t1,t2,…>\"            manual create (shared deadline)\n" +
    "  result <matchId> \"<Team>\"\n" +
    "  status\n" +
    "  clear"
  );
}
process.exit(0);
