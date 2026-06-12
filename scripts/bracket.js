// Manage the knockout bracket predictor.
//
// Create (4, 8, 16 or 32 teams, listed in bracket order — pair 1 vs 2, 3 vs 4, …):
//   node scripts/bracket.js create --deadline 2026-06-28T16:00:00Z \
//     "France,Argentina,Brazil,England,Spain,Germany,Portugal,Netherlands"
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

if (cmd === "create") {
  const dlIdx = args.indexOf("--deadline");
  const deadline = dlIdx > -1 ? new Date(args[dlIdx + 1]) : null;
  const teamsArg = args.filter((a, i) => i > 0 && a !== "--deadline" && i !== dlIdx + 1).join(" ");
  const teams = teamsArg.split(",").map((t) => t.trim()).filter(Boolean);

  if (![4, 8, 16, 32].includes(teams.length)) {
    console.error(`Need exactly 4, 8, 16 or 32 teams (got ${teams.length}).`);
    process.exit(1);
  }
  if (!deadline || isNaN(deadline)) {
    console.error("Provide --deadline <ISO date> (when first-round matches kick off).");
    process.exit(1);
  }

  const rounds = Math.log2(teams.length);
  await ref.set({
    teams,
    rounds,
    points: POINTS[teams.length],
    deadline: admin.firestore.Timestamp.fromDate(deadline),
    results: {},
  });
  console.log(`Bracket created: ${teams.length} teams, ${rounds} rounds.`);
  console.log(`Points per correct pick by round: ${POINTS[teams.length].join(" / ")}`);
  console.log(`Picks lock at ${deadline.toISOString()}.`);
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
    console.log(`Deadline: ${b.deadline.toDate().toISOString()}`);
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
  console.log('Commands: create --deadline <ISO> "<t1,t2,…>" | result <matchId> "<Team>" | status | clear');
}
process.exit(0);
