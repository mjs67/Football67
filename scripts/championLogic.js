// scripts/championLogic.js
// Pure, Firebase-free helpers for the Champion-pick admin script. Kept
// separate from championPick.js (which pulls in firebase-admin) so this logic
// can be unit-tested under plain Node, in the same spirit as scoring.js /
// stages.js / standings.js. Nothing here touches Firestore: callers pass in
// plain match objects and normalise Firestore Timestamps to `kickoffMillis`.
import { STAGE_NAMES } from "./stages.js";

// The trailing segment of a "World Cup · Round of 16" style label. Exact
// segment compare avoids the substring trap where "Final" is contained in
// "Semi-finals" and "Quarter-finals" — those must NOT match the Final.
export function stageSegment(competition) {
  return String(competition || "").split(" · ").pop().trim();
}

// Matches whose stage segment exactly equals `label`.
export function matchesForLabel(matches, label) {
  return matches.filter((m) => stageSegment(m.competition) === label);
}

// Build the picker payload from a stage's matches. Each match is expected to
// carry { home, away, homeFlag, awayFlag, kickoffMillis }. Returns the team
// list (alphabetical, for a stable grid), a name→crest map, and the earliest
// kickoff in ms — the moment picks should lock.
export function collectQualifiers(stageMatches) {
  const flags = {};
  for (const m of stageMatches) {
    for (const [name, crest] of [
      [m.home, m.homeFlag],
      [m.away, m.awayFlag],
    ]) {
      if (name && !(name in flags)) flags[name] = crest || "";
    }
  }
  const teams = Object.keys(flags).sort((a, b) => a.localeCompare(b));
  const kickoffs = stageMatches
    .map((m) => m.kickoffMillis)
    .filter((ms) => Number.isFinite(ms));
  const lockMillis = kickoffs.length ? Math.min(...kickoffs) : null;
  return { teams, flags, lockMillis };
}

// Teams knocked out of the tournament. A knockout match that has finished
// carries `advancedTeam` (the side that progressed — set only for bracket-slot
// matches, and correct for ET/penalties). The other participant is out. Group
// matches never set `advancedTeam`, so they can't eliminate anyone here.
// Returns a sorted, de-duplicated list of eliminated team names.
export function collectEliminated(allMatches) {
  const out = new Set();
  for (const m of allMatches) {
    if (m.status !== "finished" || !m.advancedTeam) continue;
    if (m.home && m.home !== m.advancedTeam) out.add(m.home);
    if (m.away && m.away !== m.advancedTeam) out.add(m.away);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

// Heuristic: do any entries still look like unresolved bracket placeholders
// ("Winner Group A", "Runner-up B", "1A", "W49", …)? If so the group stage
// probably isn't final yet and `open` should be re-run later.
export function looksUnresolved(teams) {
  return teams.some((t) => /winner|runner|loser|group|place|^[0-9]|^[A-Z][0-9]/i.test(t));
}

// The champion = advancedTeam of the finished Final. `finalMatches` are the
// matches whose stage segment === STAGE_NAMES.FINAL. Returns the team name or
// null if the Final hasn't finished / has no resolved winner yet.
export function championFromFinals(finalMatches) {
  const decided = finalMatches.find(
    (m) => m.status === "finished" && m.advancedTeam
  );
  return decided ? decided.advancedTeam : null;
}

export { STAGE_NAMES };
