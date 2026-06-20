// Static fallback venue lookup for the 2026 World Cup.
//
// Why this exists: football-data.org's bulk /v4/competitions/WC/matches
// endpoint doesn't return a `venue` field at all on the current account tier
// (confirmed: 104/104 matches came back with no venue data). Since this is a
// fixed-schedule tournament whose full match-by-stadium schedule FIFA
// published in advance, venue doesn't need to come from the live API at
// all — scripts/wc2026Schedule.json has all 104 matches (kickoff time +
// venue, sourced from FIFA's official schedule) and this module matches
// each synced match against it.
//
// Matching strategy: primarily by kickoff time (within a tolerance window,
// since two independent sources converting timezones can differ by a
// minute or two). For the 72 group-stage matches we also know the teams in
// advance, so team names disambiguate if more than one schedule entry falls
// in the same time window. The 32 knockout slots don't have fixed teams
// until earlier rounds resolve, so those match on time alone — which is
// sufficient since no two knockout matches share a kickoff time.
import { readFileSync } from "node:fs";

let schedule = [];
try {
  schedule = JSON.parse(
    readFileSync(new URL("./wc2026Schedule.json", import.meta.url), "utf8")
  );
} catch {
  console.log("No scripts/wc2026Schedule.json found — static venue fallback disabled.");
}

const TOLERANCE_MS = 90 * 60 * 1000; // 90 minutes either side

function tokens(name) {
  return (name || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // strip accents
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3); // skip noise words like "v", "de", "h"
}

function teamsOverlap(aHome, aAway, bHome, bAway) {
  const share = (x, y) => {
    const tx = tokens(x), ty = tokens(y);
    return tx.some((t) => ty.includes(t));
  };
  // Same order or swapped order — home/away orientation should agree
  // between sources, but checking both is cheap insurance.
  return (share(aHome, bHome) && share(aAway, bAway)) || (share(aHome, bAway) && share(aAway, bHome));
}

// Returns the raw venue string from the schedule (e.g. "Houston Stadium
// (NRG)") for the given match, or null if no confident match is found.
// Caller is expected to run the result through the same venues.json
// keyword lookup used for API-supplied venue strings, so formatting stays
// consistent regardless of which source resolved it.
export function venueFromSchedule(homeTeam, awayTeam, utcDate) {
  if (schedule.length === 0 || !utcDate) return null;
  const targetMs = new Date(utcDate).getTime();
  if (Number.isNaN(targetMs)) return null;

  const candidates = schedule.filter(
    (e) => Math.abs(new Date(e.utc).getTime() - targetMs) <= TOLERANCE_MS
  );
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].venue;

  // Multiple matches in the time window (shouldn't normally happen given
  // the staggered schedule, but handle it) — disambiguate by team names
  // where the schedule entry has them (group stage).
  const teamMatch = candidates.find(
    (e) => e.home && teamsOverlap(homeTeam, awayTeam, e.home, e.away)
  );
  if (teamMatch) return teamMatch.venue;

  // No team data to disambiguate with (knockout) and multiple time
  // candidates — pick the closest in time rather than guess wrong.
  candidates.sort(
    (a, b) =>
      Math.abs(new Date(a.utc).getTime() - targetMs) -
      Math.abs(new Date(b.utc).getTime() - targetMs)
  );
  return candidates[0].venue;
}
