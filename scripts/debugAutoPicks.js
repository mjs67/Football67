// DIAGNOSTIC — read-only, makes no writes. Run this to see exactly why
// fixKnockoutAutoPicks.js found 0 finished / 0 upcoming / 0 skipped, by
// printing every autoPicked prediction and how it lines up against the
// knockout matches.
//
// Run from the project root:  node scripts/debugAutoPicks.js
import { db } from "./admin.js";

const matchesSnap = await db.collection("matches").where("phase", "==", "knockout").get();
const koMatches = new Map(matchesSnap.docs.map((d) => [d.id, d.data()]));
console.log(`Knockout matches: ${koMatches.size}`);

const allAutoSnap = await db.collection("predictions").where("autoPicked", "==", true).get();
console.log(`Total predictions with autoPicked == true (any phase): ${allAutoSnap.size}`);

if (allAutoSnap.size === 0) {
  console.log(
    "\nNo autoPicked predictions exist at all yet — the safety net hasn't fired for " +
    "ANY match (group or knockout), so there's nothing for the fix script to touch. " +
    "This is expected if no unpicked match has come within 40 minutes of kickoff " +
    "since autoPickOn users were opted in."
  );
  process.exit(0);
}

let onKnockout = 0;
let exactly1v1 = 0;
console.log("\nAll autoPicked predictions:");
for (const d of allAutoSnap.docs) {
  const p = d.data();
  const m = koMatches.get(p.matchId);
  const isKo = !!m;
  if (isKo) onKnockout++;
  const is1v1 = p.home === 1 && p.away === 1;
  if (isKo && is1v1) exactly1v1++;
  console.log(
    `  ${p.displayName || p.uid} | matchId=${p.matchId} | ${isKo ? "KNOCKOUT" : "group/other"}` +
    (isKo ? ` (${m.home} v ${m.away}, ${m.status})` : "") +
    ` | home=${JSON.stringify(p.home)} away=${JSON.stringify(p.away)}` +
    (isKo && !is1v1 ? "  <-- knockout but NOT exactly {1,1}, would be skipped" : "")
  );
}

console.log(`\nautoPicked docs on a knockout match: ${onKnockout}`);
console.log(`Of those, exactly home:1/away:1: ${exactly1v1}`);
process.exit(0);
