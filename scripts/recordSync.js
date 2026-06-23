// Writes a last-sync heartbeat to settings/syncStatus in Firestore.
// Called by the GitHub Action after a successful syncMatches run.
// Keeps the document tiny — just enough for the UI to show
// "model last updated X minutes ago" and for debugging missed runs.
//
// Usage: node scripts/recordSync.js
import { readFileSync, existsSync } from "node:fs";
import admin from "firebase-admin";

// Explicit credential path takes priority (set by the GitHub Action via
// GOOGLE_APPLICATION_CREDENTIALS). Falls back to ./serviceAccount.json
// for local manual runs, then to ADC as a last resort.
const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (credPath && existsSync(credPath)) {
  const sa = JSON.parse(readFileSync(credPath, "utf8"));
  admin.initializeApp({ credential: admin.credential.cert(sa) });
} else if (existsSync("./serviceAccount.json")) {
  const sa = JSON.parse(readFileSync("./serviceAccount.json", "utf8"));
  admin.initializeApp({ credential: admin.credential.cert(sa) });
} else {
  admin.initializeApp();
}

const db = admin.firestore();
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
