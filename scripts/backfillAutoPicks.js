// One-time recovery: backfills the auto-pick safety net for matches that
// already went FINISHED before a delayed/missed sync run could lodge a
// default 1-1 for an autoPickOn user (see the syncMatches.js fix — the old
// auto-pick query had a `kickoff > now` lower bound, so a single skipped or
// late GitHub Actions run could permanently skip a match for that user).
//
// This only fills genuine gaps: opted-in users who have *no* prediction at
// all for a finished match. It never touches or overwrites a real pick.
//
// Run from the project root:  node scripts/backfillAutoPicks.js
import { readFileSync } from "node:fs";
import admin from "firebase-admin";
import { recomputeLeaderboard } from "./recompute.js";

const sa = JSON.parse(readFileSync("./serviceAccount.json", "utf8"));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const [finishedSnap, optedInSnap] = await Promise.all([
  db.collection("matches").where("status", "==", "finished").get(),
  db.collection("users").where("autoPickOn", "==", true).get(),
]);

console.log(
  `Checking ${finishedSnap.size} finished match(es) against ${optedInSnap.size} autopick-enabled player(s)…`
);

let filled = 0;
let batch = db.batch();
let writes = 0;

for (const u of optedInSnap.docs) {
  for (const m of finishedSnap.docs) {
    const ref = db.doc(`predictions/${u.id}_${m.id}`);
    if ((await ref.get()).exists) continue; // already has a real or auto pick — leave it

    const md = m.data();
    batch.set(ref, {
      uid: u.id,
      matchId: m.id,
      home: 1,
      away: 1,
      autoPicked: true,
      backfilled: true, // flag so it's easy to audit/undo later if needed
      displayName: u.data().displayName || "Anonymous",
      photoURL: u.data().photoURL || "",
      updatedAt: admin.firestore.Timestamp.now(),
    });
    filled++;
    console.log(`  + ${u.data().displayName || u.id} — ${md.home} v ${md.away}`);

    if (++writes % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
}
await batch.commit();
console.log(`Backfilled ${filled} missing prediction(s).`);

console.log("Recomputing leaderboard…");
const players = await recomputeLeaderboard(db);
console.log(`Updated ${players} players.`);
process.exit(0);
