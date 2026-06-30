// Manage the "pick the tournament winner" bonus (+30, paid once after the Final).
//
// Lifecycle:
//   1. After the group stage is final and the first knockout round's teams are
//      known, open the pick. Picks lock at that round's first kickoff.
//   2. After the Final, publish the winner — this awards +30 and recomputes.
//
// Usage:
//   node scripts/championPick.js open            (defaults to LAST_16)
//   node scripts/championPick.js open LAST_32    (or QUARTER_FINALS, …)
//   node scripts/championPick.js winner Brazil
//   node scripts/championPick.js winner --auto   (reads the Final's advancedTeam)
//   node scripts/championPick.js status
//   node scripts/championPick.js clear
import { db, admin } from "./admin.js";
import { recomputeLeaderboard } from "./recompute.js";
import { STAGE_NAMES } from "./stages.js";
import {
  matchesForLabel,
  collectQualifiers,
  looksUnresolved,
  championFromFinals,
} from "./championLogic.js";

const ref = db.doc("settings/champion");

// Firestore docs → plain objects with kickoff normalised to millis, so all the
// actual logic lives in the pure (testable) championLogic module.
async function allMatches() {
  const snap = await db.collection("matches").get();
  return snap.docs.map((d) => {
    const m = d.data();
    return {
      id: d.id,
      home: m.home,
      away: m.away,
      homeFlag: m.homeFlag,
      awayFlag: m.awayFlag,
      competition: m.competition,
      status: m.status,
      advancedTeam: m.advancedTeam,
      kickoffMillis: m.kickoff?.toMillis ? m.kickoff.toMillis() : null,
    };
  });
}

const [, , cmd, ...rest] = process.argv;

if (cmd === "open") {
  const stage = (rest[0] || "LAST_16").toUpperCase();
  const label = STAGE_NAMES[stage];
  if (!label) {
    console.error(`Unknown stage "${stage}". One of: ${Object.keys(STAGE_NAMES).join(", ")}`);
    process.exit(1);
  }

  const stageMatches = matchesForLabel(await allMatches(), label);
  if (stageMatches.length === 0) {
    console.error(`No "${label}" matches found yet. Has the bracket been synced?`);
    process.exit(1);
  }

  const { teams, flags, lockMillis } = collectQualifiers(stageMatches);
  if (!lockMillis) {
    console.error(`"${label}" matches have no kickoff times yet; cannot set a lock.`);
    process.exit(1);
  }

  await ref.set({
    stage,
    stageLabel: label,
    teams,
    flags,
    lockAt: admin.firestore.Timestamp.fromMillis(lockMillis),
    winner: null,
  });

  console.log(
    `Champion pick opened for ${label}: ${teams.length} teams, ` +
      `locks ${new Date(lockMillis).toISOString()}.`
  );
  if (teams.length !== stageMatches.length * 2) {
    console.log(`  Note: ${teams.length} teams from ${stageMatches.length} matches (expected ${stageMatches.length * 2}).`);
  }
  if (looksUnresolved(teams)) {
    console.log("  ⚠ Some entries look like unresolved placeholders — re-run once the group stage is final.");
  }
} else if (cmd === "winner") {
  const snap = await ref.get();
  if (!snap.exists) {
    console.error('Champion pick has not been opened. Run "open" first.');
    process.exit(1);
  }

  let team = rest.join(" ").trim();
  if (team === "--auto") {
    const finals = matchesForLabel(await allMatches(), STAGE_NAMES.FINAL);
    team = championFromFinals(finals);
    if (!team) {
      console.error("No finished Final with a resolved winner yet.");
      process.exit(1);
    }
  }
  if (!team) {
    console.error("Usage: node scripts/championPick.js winner <Team>|--auto");
    process.exit(1);
  }

  const teams = snap.data().teams || [];
  if (teams.length && !teams.includes(team)) {
    console.error(`"${team}" is not among the qualified teams. Check spelling.\n  Qualified: ${teams.join(", ")}`);
    process.exit(1);
  }

  await ref.set({ winner: team }, { merge: true });
  const n = await recomputeLeaderboard(db);
  console.log(`Champion set to "${team}". +30 applied; leaderboard recomputed for ${n} players.`);
} else if (cmd === "status") {
  const snap = await ref.get();
  if (!snap.exists) {
    console.log("Champion pick not opened.");
  } else {
    const d = snap.data();
    const picks = await db.collection("championPicks").get();
    const lock = d.lockAt?.toDate ? d.lockAt.toDate().toISOString() : d.lockAt;
    console.log(`Stage:  ${d.stageLabel} (${(d.teams || []).length} teams)`);
    console.log(`Locks:  ${lock}`);
    console.log(`Winner: ${d.winner || "(not set)"}`);
    console.log(`Picks:  ${picks.size} submitted`);
  }
} else if (cmd === "clear") {
  await ref.delete();
  // Recompute so the +30 is dropped from anyone who had it (winner is now gone).
  const n = await recomputeLeaderboard(db);
  console.log(`Champion pick cleared. Leaderboard recomputed for ${n} players (bonus removed).`);
} else {
  console.log("Commands: open [STAGE] | winner <Team>|--auto | status | clear");
}
process.exit(0);
