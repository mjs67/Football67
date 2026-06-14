import { readFileSync } from "node:fs";
import admin from "firebase-admin";
const sa = JSON.parse(readFileSync("./serviceAccount.json", "utf8"));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const snap = await db.collection("matches").get();
snap.forEach((d) => {
  const m = d.data();
  if (/Morocco|Switzerland/.test(m.home + m.away))
    console.log(d.id, "|", m.home, m.homeScore, "-", m.awayScore, m.away, "|", m.status);
});
process.exit(0);
