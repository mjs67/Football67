// Manage the tournament tiebreaker.
// Usage:
//   node scripts/tiebreaker.js set "Total goals scored across all fixtures?"
//   node scripts/tiebreaker.js answer 87
//   node scripts/tiebreaker.js clear
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
const ref = db.doc("settings/tiebreaker");

const [, , cmd, ...rest] = process.argv;

if (cmd === "set") {
  const question = rest.join(" ").trim();
  if (!question) {
    console.error('Usage: node scripts/tiebreaker.js set "Your question?"');
    process.exit(1);
  }
  await ref.set({ question, answer: null });
  console.log(`Tiebreaker question set: "${question}"`);
} else if (cmd === "answer") {
  const answer = Number(rest[0]);
  if (!Number.isFinite(answer)) {
    console.error("Usage: node scripts/tiebreaker.js answer <number>");
    process.exit(1);
  }
  await ref.set({ answer }, { merge: true });
  const n = await recomputeLeaderboard(db);
  console.log(`Answer published (${answer}). Leaderboard re-ranked for ${n} players.`);
} else if (cmd === "clear") {
  await ref.delete();
  console.log("Tiebreaker cleared.");
} else {
  console.log('Commands: set "<question>" | answer <number> | clear');
}
process.exit(0);
