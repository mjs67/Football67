// Exports all finished matches with Poisson model inputs (lh, la) and
// actual scores to a local JSON file for offline analysis.
//
// Usage:
//   node scripts/exportMatches.js
//
// Requires serviceAccount.json in the project root (same as syncMatches.js).

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import admin from "firebase-admin";

if (existsSync("./serviceAccount.json")) {
  const sa = JSON.parse(readFileSync("./serviceAccount.json", "utf8"));
  admin.initializeApp({ credential: admin.credential.cert(sa) });
} else {
  admin.initializeApp(); // uses GOOGLE_APPLICATION_CREDENTIALS
}

const db = admin.firestore();

const snap = await db
  .collection("matches")
  .where("status", "==", "finished")
  .get();

const rows = snap.docs
  .map((d) => {
    const m = d.data();
    if (!m.odds?.lh || m.homeScore == null) return null;
    return {
      id: d.id,
      match: `${m.home} v ${m.away}`,
      kickoff: m.kickoff?.toDate?.().toISOString() ?? null,
      competition: m.competition ?? null,
      lh: m.odds.lh,       // model expected goals — home
      la: m.odds.la,       // model expected goals — away
      n: m.odds.n ?? null, // matches used to build the estimate
      homeScore: m.homeScore,
      awayScore: m.awayScore,
    };
  })
  .filter(Boolean)
  .sort((a, b) => (a.kickoff ?? "").localeCompare(b.kickoff ?? ""));

const outPath = "./scripts/matchesExport.json";
writeFileSync(outPath, JSON.stringify(rows, null, 2));
console.log(`Exported ${rows.length} finished matches → ${outPath}`);
process.exit(0);
