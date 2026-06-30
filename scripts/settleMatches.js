// Enters final scores and recomputes the leaderboard.
// Usage:
//   npm run settle                          → interactive: lists unfinished matches,
//                                             prompts for each final score
//   node scripts/settleMatches.js --recount → just recompute all user points
//
// Scoring: exact score = 5 pts, correct result (W/D/L) = 3 pts, else 0.
import { createInterface } from "node:readline/promises";
import { db } from "./admin.js";
import { recomputeLeaderboard } from "./recompute.js";

const recountOnly = process.argv.includes("--recount");

if (!recountOnly) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const snap = await db
    .collection("matches")
    .where("status", "==", "upcoming")
    .orderBy("kickoff")
    .get();

  if (snap.empty) console.log("No unfinished matches.");

  for (const docSnap of snap.docs) {
    const m = docSnap.data();
    const answer = (
      await rl.question(`${m.home} vs ${m.away} — final score (e.g. 2-1, blank to skip): `)
    ).trim();
    if (!answer) continue;
    const match = answer.match(/^(\d+)\s*[-:]\s*(\d+)$/);
    if (!match) {
      console.log("  ✗ Could not parse, skipping.");
      continue;
    }
    await docSnap.ref.update({
      status: "finished",
      homeScore: Number(match[1]),
      awayScore: Number(match[2]),
    });
    console.log("  ✓ Saved.");
  }
  rl.close();
}

// ── Recompute every player's points from scratch ────────────────────
console.log("Recomputing leaderboard…");
const players = await recomputeLeaderboard(db);
console.log(`Updated ${players} players.`);
process.exit(0);
