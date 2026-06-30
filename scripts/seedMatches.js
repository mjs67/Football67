// Seeds sample fixtures into Firestore.
// Usage:
//   1. Download a service account key: Firebase Console → Project settings
//      → Service accounts → Generate new private key → save as serviceAccount.json
//      in the project root (it is gitignored).
//   2. npm run seed
import { db, admin } from "./admin.js";

const hours = (n) => new Date(Date.now() + n * 3600 * 1000);

// ── Group-stage sample fixtures (upcoming) ──
const fixtures = [
  { home: "Brazil", away: "Germany", homeFlag: "🇧🇷", awayFlag: "🇩🇪", competition: "World Cup · Group A", venue: "Estadio Azteca · Mexico City, Mexico", kickoff: hours(26) },
  { home: "Argentina", away: "France", homeFlag: "🇦🇷", awayFlag: "🇫🇷", competition: "World Cup · Group B", venue: "MetLife Stadium · New York / New Jersey, USA", kickoff: hours(30) },
  { home: "Spain", away: "England", homeFlag: "🇪🇸", awayFlag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", competition: "World Cup · Group C", venue: "SoFi Stadium · Los Angeles, USA", kickoff: hours(50) },
  { home: "USA", away: "Mexico", homeFlag: "🇺🇸", awayFlag: "🇲🇽", competition: "World Cup · Group D", venue: "AT&T Stadium · Arlington (Dallas), USA", kickoff: hours(54) },
  { home: "Japan", away: "Morocco", homeFlag: "🇯🇵", awayFlag: "🇲🇦", competition: "World Cup · Group E", venue: "Lumen Field · Seattle, USA", kickoff: hours(74) },
  { home: "Portugal", away: "Netherlands", homeFlag: "🇵🇹", awayFlag: "🇳🇱", competition: "World Cup · Group F", venue: "BMO Field · Toronto, Canada", kickoff: hours(78) },
];

// ── Knockout (Round of 16) sample fixtures ──
// 16 teams in bracket order; the first R16 match kicks off tomorrow (+~24h).
// Each carries the machine-readable tags syncMatches.js stamps in production:
//   phase: "knockout", round: 0, bracketSlot: "r0-<i>".
// To exercise the elimination / re-pick flow offline, the first two matches
// are already FINISHED (so a champion pick of e.g. Croatia or Senegal is out).
const R16_TEAMS = [
  ["Argentina", "Australia", "🇦🇷", "🇦🇺"],
  ["France", "Senegal", "🇫🇷", "🇸🇳"],
  ["Spain", "Japan", "🇪🇸", "🇯🇵"],
  ["Brazil", "Croatia", "🇧🇷", "🇭🇷"],
  ["England", "Mexico", "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "🇲🇽"],
  ["Portugal", "Morocco", "🇵🇹", "🇲🇦"],
  ["Germany", "Switzerland", "🇩🇪", "🇨🇭"],
  ["Netherlands", "USA", "🇳🇱", "🇺🇸"],
];

// First R16 kickoff ~24h out; space the 8 ties ~4h apart over two days.
const r16Fixtures = R16_TEAMS.map(([home, away, hf, af], i) => {
  const finished = i < 2; // first two already played, for offline testing
  const base = {
    home, away, homeFlag: hf, awayFlag: af,
    competition: "World Cup · Round of 16",
    venue: "Neutral venue · USA / Canada / Mexico",
    kickoff: hours(24 + i * 4),
    phase: "knockout",
    round: 0,
    bracketSlot: `r0-${i}`,
  };
  if (finished) {
    // Home team advances in both finished demo ties (Argentina, France).
    return {
      ...base,
      kickoff: hours(-6 + i * 2), // already kicked off / done
      status: "finished",
      homeScore: 2,
      awayScore: 1,
      advancedTeam: home,
    };
  }
  return { ...base, status: "upcoming", homeScore: null, awayScore: null, advancedTeam: null };
});

const batch = db.batch();
for (const f of fixtures) {
  const ref = db.collection("matches").doc();
  batch.set(ref, {
    ...f,
    kickoff: admin.firestore.Timestamp.fromDate(f.kickoff),
    status: "upcoming",
    homeScore: null,
    awayScore: null,
    phase: "group",
    round: null,
    bracketSlot: null,
  });
}
for (const f of r16Fixtures) {
  const ref = db.collection("matches").doc();
  const { kickoff, ...rest } = f;
  batch.set(ref, { ...rest, kickoff: admin.firestore.Timestamp.fromDate(kickoff) });
}

// ── Bracket settings doc (champion-tier model) ──
// 16-team bracket, tier decay 20/14/9/5, per-round lock deadlines set 1h
// before each round's first kickoff. R16 locks ~23h from now (tomorrow).
const bracketTeams = R16_TEAMS.flatMap(([h, a]) => [h, a]);
const dl = (n) => admin.firestore.Timestamp.fromDate(hours(n));
batch.set(db.doc("settings/bracket"), {
  teams: bracketTeams,
  rounds: 4,
  tierPoints: [20, 14, 9, 5],
  deadline: dl(23), // earliest (R16) — legacy field, kept for safety
  deadlines: {
    "0": dl(23),  // Round of 16 — 1h before first R16 kickoff (+24h)
    "1": dl(120), // Quarter-finals (~5 days out)
    "2": dl(216), // Semi-finals (~9 days out)
    "3": dl(384), // Final (~16 days out)
  },
});

await batch.commit();
console.log(
  `Seeded ${fixtures.length} group + ${r16Fixtures.length} R16 fixtures ` +
  `(${r16Fixtures.filter((f) => f.status === "finished").length} finished) ` +
  `and the settings/bracket doc.`
);
process.exit(0);
