// One-time migration: reshapes legacy brackets/{uid} docs from flat picks
// to the new per-round rounds schema.
//
// Old format:  { picks: { "r0-0": "Argentina", ... }, updatedAt }
// New format:  { rounds: { 0: { picks: {...} }, 1: { picks: {...} }, ... } }
//
// Safe to re-run: docs already in new format are skipped.
//
// Usage:
//   node scripts/migrateBrackets.js
//
import { readFileSync } from "node:fs";
import admin from "firebase-admin";

const serviceAccount = JSON.parse(readFileSync("./serviceAccount.json", "utf8"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// Read how many rounds exist from bracket settings so we can bucket correctly.
const settingsSnap = await db.doc("settings/bracket").get();
if (!settingsSnap.exists) {
  console.error("settings/bracket not found — set up the bracket first.");
  process.exit(1);
}
const { rounds: totalRounds } = settingsSnap.data();

const allBrackets = await db.collection("brackets").get();
console.log(`Found ${allBrackets.size} bracket docs.`);

let migrated = 0;
let skipped = 0;
let batch = db.batch();
let batchCount = 0;

for (const docSnap of allBrackets.docs) {
  const data = docSnap.data();

  // Already in new format — skip
  if (data.rounds) {
    skipped++;
    continue;
  }

  // Legacy flat picks — bucket by round index
  const flatPicks = data.picks || {};
  const rounds = {};
  for (let r = 0; r < totalRounds; r++) {
    const roundPicks = {};
    for (const [id, team] of Object.entries(flatPicks)) {
      const match = id.match(/^r(\d+)-/);
      if (match && Number(match[1]) === r) {
        roundPicks[id] = team;
      }
    }
    if (Object.keys(roundPicks).length > 0) {
      rounds[r] = {
        picks: roundPicks,
        // Use the doc's updatedAt as the lockedAt approximation
        lockedAt: data.updatedAt || admin.firestore.FieldValue.serverTimestamp(),
        migratedFromLegacy: true,
      };
    }
  }

  batch.set(
    docSnap.ref,
    { rounds, migratedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
  migrated++;
  batchCount++;

  if (batchCount === 400) {
    await batch.commit();
    batch = db.batch();
    batchCount = 0;
    console.log(`  Committed batch…`);
  }
}

if (batchCount > 0) await batch.commit();

console.log(`Done. Migrated: ${migrated}, already up-to-date: ${skipped}.`);
process.exit(0);
