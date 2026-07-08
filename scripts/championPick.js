// Manage the "pick the tournament winner" bonus (+67, paid once after the Final).
//
// Lifecycle:
//   1. After the group stage is final and the first knockout round's teams are
//      known, open the pick. Picks lock at that round's first kickoff.
//   2. After the Final, publish the winner — this awards +67 and recomputes.
//
// Usage:
//   node scripts/championPick.js open            (defaults to LAST_16)
//   node scripts/championPick.js open LAST_32    (or QUARTER_FINALS, …)
//   node scripts/championPick.js refresh         (safe for scheduled automation — see below)
//   node scripts/championPick.js winner Brazil
//   node scripts/championPick.js winner --auto   (reads the Final's advancedTeam)
//   node scripts/championPick.js setlock <ISO-8601 datetime>  (manual override, e.g. for the Final kickoff)
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
} else if (cmd === "refresh") {
  // Idempotent, automation-safe version of `open`. Meant to run unattended on
  // every scheduled sync (alongside syncMatches.js) so the team grid grows as
  // more Round of 16 matchups get confirmed, WITHOUT any of the footguns a
  // blind `open` would have on a timer:
  //   - never clobbers a published winner (would silently erase the +67)
  //   - never touches anything once picks are already locked
  //   - never re-writes Firestore when nothing has actually changed
  // First run with nothing open yet behaves just like `open LAST_16`.
  const snap = await ref.get();
  const existing = snap.exists ? snap.data() : null;

  if (existing?.winner) {
    console.log("Champion already decided — refresh skipped.");
    process.exit(0);
  }

  const existingLockMs = existing?.lockAt?.toMillis ? existing.lockAt.toMillis() : 0;
  if (existingLockMs && Date.now() >= existingLockMs) {
    console.log("Picks already locked — refresh skipped.");
    process.exit(0);
  }

  const stage = existing?.stage || "LAST_16";
  const label = STAGE_NAMES[stage];
  const stageMatches = matchesForLabel(await allMatches(), label);
  if (stageMatches.length === 0) {
    console.log(`No "${label}" matches yet — nothing to refresh.`);
    process.exit(0);
  }

  const { teams, flags, lockMillis } = collectQualifiers(stageMatches);
  if (!lockMillis) {
    console.log(`"${label}" matches have no kickoff times yet — nothing to refresh.`);
    process.exit(0);
  }

  if (existing && existing.teams?.length === teams.length) {
    console.log(`No new teams (${teams.length}/${stageMatches.length * 2} known) — refresh skipped.`);
    process.exit(0);
  }

  const lockManual = !!existing?.lockManual;

  await ref.set({
    stage,
    stageLabel: label,
    teams,
    flags,
    lockAt: lockManual ? existing.lockAt : admin.firestore.Timestamp.fromMillis(lockMillis),
    lockManual,
    winner: null,
  });

  console.log(`Champion pick refreshed for ${label}: ${teams.length}/${stageMatches.length * 2} teams known.`);
  if (lockManual) {
    console.log("  Lock time is manually pinned (setlock) — left untouched.");
  }
  if (looksUnresolved(teams)) {
    console.log("  ⚠ Some entries look like unresolved placeholders.");
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
  console.log(`Champion set to "${team}". +67 applied; leaderboard recomputed for ${n} players.`);
} else if (cmd === "setlock") {
  // Manual override: pin the countdown to an exact instant regardless of any
  // match's kickoff time. Useful when the close time is a fixed calendar
  // moment (e.g. the Final) rather than derived from `open`/`refresh`.
  const snap = await ref.get();
  if (!snap.exists) {
    console.error('Champion pick has not been opened. Run "open" first.');
    process.exit(1);
  }
  const raw = rest.join(" ").trim();
  if (!raw) {
    console.error("Usage: node scripts/championPick.js setlock <ISO-8601 datetime>");
    console.error('Example: node scripts/championPick.js setlock "2026-07-19T15:00:00-04:00"');
    process.exit(1);
  }
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) {
    console.error(`Could not parse "${raw}" as a date/time. Use an ISO-8601 string with a timezone offset.`);
    process.exit(1);
  }
  if (ms <= Date.now()) {
    console.log("  ⚠ That time is in the past — picks will lock immediately.");
  }
  await ref.set({ lockAt: admin.firestore.Timestamp.fromMillis(ms), lockManual: true }, { merge: true });
  console.log(`Champion pick lock set to ${new Date(ms).toISOString()} (${new Date(ms).toString()}).`);
  console.log("This lock time is now pinned — scheduled `refresh` runs will not override it.");
} else if (cmd === "status") {
  const snap = await ref.get();
  if (!snap.exists) {
    console.log("Champion pick not opened.");
  } else {
    const d = snap.data();
    const picks = await db.collection("championPicks").get();
    const lock = d.lockAt?.toDate ? d.lockAt.toDate().toISOString() : d.lockAt;
    console.log(`Stage:  ${d.stageLabel} (${(d.teams || []).length} teams)`);
    console.log(`Locks:  ${lock}${d.lockManual ? " (manually pinned)" : ""}`);
    console.log(`Winner: ${d.winner || "(not set)"}`);
    console.log(`Picks:  ${picks.size} submitted`);
  }
} else if (cmd === "clear") {
  await ref.delete();
  // Recompute so the +67 is dropped from anyone who had it (winner is now gone).
  const n = await recomputeLeaderboard(db);
  console.log(`Champion pick cleared. Leaderboard recomputed for ${n} players (bonus removed).`);
} else {
  console.log("Commands: open [STAGE] | refresh | winner <Team>|--auto | setlock <ISO-datetime> | status | clear");
}
process.exit(0);
