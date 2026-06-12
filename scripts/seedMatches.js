// Seeds sample fixtures into Firestore.
// Usage:
//   1. Download a service account key: Firebase Console → Project settings
//      → Service accounts → Generate new private key → save as serviceAccount.json
//      in the project root (it is gitignored).
//   2. npm run seed
import { readFileSync } from "node:fs";
import admin from "firebase-admin";

const serviceAccount = JSON.parse(readFileSync("./serviceAccount.json", "utf8"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const hours = (n) => new Date(Date.now() + n * 3600 * 1000);

const fixtures = [
  { home: "Brazil", away: "Germany", homeFlag: "🇧🇷", awayFlag: "🇩🇪", competition: "World Cup · Group A", kickoff: hours(26) },
  { home: "Argentina", away: "France", homeFlag: "🇦🇷", awayFlag: "🇫🇷", competition: "World Cup · Group B", kickoff: hours(30) },
  { home: "Spain", away: "England", homeFlag: "🇪🇸", awayFlag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", competition: "World Cup · Group C", kickoff: hours(50) },
  { home: "USA", away: "Mexico", homeFlag: "🇺🇸", awayFlag: "🇲🇽", competition: "World Cup · Group D", kickoff: hours(54) },
  { home: "Japan", away: "Morocco", homeFlag: "🇯🇵", awayFlag: "🇲🇦", competition: "World Cup · Group E", kickoff: hours(74) },
  { home: "Portugal", away: "Netherlands", homeFlag: "🇵🇹", awayFlag: "🇳🇱", competition: "World Cup · Group F", kickoff: hours(78) },
];

const batch = db.batch();
for (const f of fixtures) {
  const ref = db.collection("matches").doc();
  batch.set(ref, {
    ...f,
    kickoff: admin.firestore.Timestamp.fromDate(f.kickoff),
    status: "upcoming",
    homeScore: null,
    awayScore: null,
  });
}
await batch.commit();
console.log(`Seeded ${fixtures.length} fixtures.`);
process.exit(0);
