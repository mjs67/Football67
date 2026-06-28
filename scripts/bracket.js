// Manage the knockout bracket predictor (champion-tier scoring model).
//
// SCORING MODEL — "predict the tournament winner, locked by round":
//   A user makes ONE prediction that scores: who wins the tournament.
//   Points are set by WHICH ROUND'S LOCK-WINDOW was open when they last
//   set their current champion pick — the earlier they commit, the more
//   it is worth. They only collect if that pick actually wins the final.
//
//     Locked during Round-of-16 window → 20 pts
//     Locked during Quarter-final window → 14 pts
//     Locked during Semi-final window →  9 pts
//     Locked during Final window      →  5 pts
//
//   A round's lock-window closes 1 hour before that round's first kickoff.
//   Re-picking (because your team was eliminated, OR voluntarily) re-stamps
//   the tier to whatever window is open at that moment. Re-confirming the
//   SAME team does not change the tier.
//
//   The full bracket tree is still fillable (for the share card + visual),
//   but only the champion pick scores. The champion's TIER lives on each
//   user's brackets/{uid}.champion = { team, tier, history }.
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
//   Shorthand: if all rounds share one deadline, use --deadline:
//   node scripts/bracket.js create --deadline 2026-06-28T16:00:00Z "France,..."
//
// Record the tournament winner and per-slot results are NO LONGER manual:
// the bracket derives every elimination and the champion winner straight
// from the `matches` collection (finished knockout matches carry `phase`,
// `round`, `bracketSlot`, and `advancedTeam`, stamped by syncMatches.js).
// That is the single source of truth — there is no results map to maintain.
//
// Other commands:
//   node scripts/bracket.js status     → print the bracket + derived results
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

// Champion-tier points by LOCK ROUND (0=R16, 1=QF, 2=SF, 3=Final).
// Index = the round-window in which the user last set their champion pick.
const TIER_POINTS = [20, 14, 9, 5];

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
    // Champion-tier decay schedule, indexed by lock round.
    tierPoints: TIER_POINTS.slice(0, rounds),
    deadline: admin.firestore.Timestamp.fromDate(earliestDeadline),
    deadlines: deadlinesMap,
  });
  console.log(`Bracket created: ${teams.length} teams, ${rounds} rounds.`);
  console.log(`Champion-tier points by lock round: ${TIER_POINTS.slice(0, rounds).join(" / ")}`);
  console.log(`Per-round lock deadlines:`);
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

  const knockoutStages = ["LAST_32", "LAST_16", "QUARTER_FINALS", "SEMI_FINALS"];
  let firstStageMatches = [];
  let detectedSize = null;

  for (const stage of knockoutStages) {
    const stageMatches = data.matches
      .filter((m) => m.stage === stage)
      .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));

    if (stageMatches.length === 0) continue;

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

  const teams = firstStageMatches.flatMap((m) => [
    teamName(m.homeTeam),
    teamName(m.awayTeam),
  ]);

  console.log(`Teams (${teams.length}): ${teams.join(", ")}`);

  const rounds = Math.log2(teams.length);
  const roundDeadlines = [];

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

    // Deadline = 1 hour before the EARLIEST kickoff in that round
    const earliest = Math.min(...stageMs);
    roundDeadlines.push(new Date(earliest - 60 * 60 * 1000));
    console.log(`Round ${r} (${stageName}): first kickoff ${new Date(earliest).toISOString()}, deadline ${roundDeadlines[r].toISOString()}`);
  }

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

} else if (cmd === "status") {
  const snap = await ref.get();
  if (!snap.exists) {
    console.log("No bracket set.");
  } else {
    const b = snap.data();
    console.log(`Teams (${b.teams.length}): ${b.teams.join(", ")}`);
    const tp = b.tierPoints || TIER_POINTS;
    console.log(`Champion-tier points by lock round: ${tp.join(" / ")}`);
    if (b.deadlines) {
      console.log(`Per-round lock deadlines:`);
      for (let r = 0; r < b.rounds; r++) {
        const dl = b.deadlines[String(r)];
        console.log(`  Round ${r}: ${dl ? dl.toDate().toISOString() : "not set"}`);
      }
    } else {
      console.log(`Deadline (all rounds): ${b.deadline.toDate().toISOString()}`);
    }

    // Derive results + winner from finished knockout matches (source of truth).
    const koSnap = await db
      .collection("matches")
      .where("phase", "==", "knockout")
      .where("status", "==", "finished")
      .get();
    const derived = {};
    for (const d of koSnap.docs) {
      const m = d.data();
      if (!m.bracketSlot) continue;
      const won =
        m.advancedTeam ||
        (m.homeScore != null && m.awayScore != null && m.homeScore !== m.awayScore
          ? m.homeScore > m.awayScore ? m.home : m.away
          : null);
      if (won) derived[m.bracketSlot] = won;
    }
    console.log(`Tournament winner: ${derived[`r${b.rounds - 1}-0`] || "(not yet decided)"}`);
    let matches = b.teams.length / 2;
    for (let r = 0; r < b.rounds; r++) {
      const ids = Array.from({ length: matches }, (_, i) => {
        const id = `r${r}-${i}`;
        return `${id}${derived[id] ? ` → ${derived[id]}` : ""}`;
      });
      console.log(`Round ${r}: ${ids.join("  ")}`);
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
    "  status                                          print bracket + derived results\n" +
    "  clear\n" +
    "\n" +
    "Results & winner are derived automatically from finished knockout\n" +
    "matches synced by syncMatches.js — there is nothing to record by hand."
  );
}
process.exit(0);
