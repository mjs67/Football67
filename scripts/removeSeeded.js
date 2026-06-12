// One-time cleanup: removes the fake sample fixtures created by `npm run seed`
// (and any predictions made on them), leaving the real API-synced matches
// untouched. Real matches have ids starting with "fd_"; seeded ones don't.
//
// Run from the project root:  node scripts/removeSeeded.js
import { readFileSync } from "node:fs";
import admin from "firebase-admin";

const sa = JSON.parse(readFileSync("./serviceAccount.json", "utf8"));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const snap = await db.collection("matches").get();
let removed = 0;

for (const d of snap.docs) {
  if (d.id.startsWith("fd_")) continue; // real, API-synced — keep

  const m = d.data();
  // Remove any predictions players made on this fake match
  const preds = await db.collection("predictions").where("matchId", "==", d.id).get();
  for (const p of preds.docs) await p.ref.delete();
  // Remove any reminder bookkeeping for it
  const rems = await db.collection("reminders").where("matchId", "==", d.id).get();
  for (const r of rems.docs) await r.ref.delete();

  await d.ref.delete();
  removed++;
  console.log(`Removed sample fixture: ${m.home} vs ${m.away}`);
}

console.log(`Done — removed ${removed} sample fixtures. Run a sync to refresh the leaderboard.`);
process.exit(0);
