// Manage the knockout bracket predictor.
//
// Create (4, 8, 16 or 32 teams, listed in bracket order — pair 1 vs 2, 3 vs 4, …):
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

if (cmd === "create") {
  const knownFlags = ["--deadline", "--deadline-r0", "--deadline-r1", "--deadline-r2", "--deadline-r3"];

  // Per-round deadlines (new format)
  const dlR0 = getFlag("--deadline-r0");
  const dlR1 = getFlag("--deadline-r1");
  const dlR2 = getFlag("--deadline-r2");
  const dlR3 = getFlag("--deadline-r3");

  // Legacy single deadline fallback
  const dlLegacy = getFlag("--deadline");

  // Resolve per-round: use specific flag if given, else fall back to legacy
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

  // Build per-round deadline array — only as many entries as there are rounds
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

  // deadlines map: keys are string round indices ("0", "1", …) — Firestore
  // map keys are always strings, and the rules reference them as b.deadlines['0'].
  const deadlinesMap = {};
  for (let r = 0; r < rounds; r++) {
    deadlinesMap[String(r)] = admin.firestore.Timestamp.fromDate(roundDeadlines[r]);
  }

  // Keep legacy `deadline` = earliest round deadline for any code still reading it
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
} else if (cmd === "result") {
  const [, matchId, ...teamParts] = args;
  const team = teamParts.join(" ").trim();
  if (!matchId || !team) {
    console.error('Usage: node scripts/bracket.js result <matchId> "<Team>"');
    process.exit(1);
  }
  const snap = await ref.get();
  if (!snap.exists) {
    console.error("No bracket exists. Run `create` first.");
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
    "  create --deadline-r0 <ISO> --deadline-r1 <ISO> --deadline-r2 <ISO> --deadline-r3 <ISO> \"<t1,t2,…>\"\n" +
    "  create --deadline <ISO> \"<t1,t2,…>\"   (all rounds share one deadline)\n" +
    "  result <matchId> \"<Team>\"\n" +
    "  status\n" +
    "  clear"
  );
}
process.exit(0);
