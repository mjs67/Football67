// Writes a last-sync heartbeat to settings/syncStatus in Firestore.
// Called by the GitHub Action after a successful syncMatches run.
// Keeps the document tiny — just enough for the UI to show
// "model last updated X minutes ago" and for debugging missed runs.
//
// Usage: node scripts/recordSync.js
import { db, admin } from "./admin.js";

const now = new Date();

await db.doc("settings/syncStatus").set({
  lastSyncAt:  admin.firestore.Timestamp.fromDate(now),
  lastSyncIso: now.toISOString(),
  competition: process.env.COMPETITION || "WC",
  triggeredBy: process.env.GITHUB_EVENT_NAME || "manual",
  runId:       process.env.GITHUB_RUN_ID || null,
}, { merge: true });

console.log(`Heartbeat written: ${now.toISOString()}`);
process.exit(0);
