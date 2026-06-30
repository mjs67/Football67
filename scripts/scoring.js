// src/scoring.js
// Single source of truth for prediction scoring. PURE functions only — no
// Firebase, no DOM, no Vite-only syntax — so both the browser app (src/) and
// the Node automation scripts (scripts/) import the very same rules.
//
// Before this module existed the same logic was hand-copied into poisson.js,
// recompute.js, roastGeneration.js and shareCard.js. Change the rules HERE,
// once, and every surface stays in agreement.
//
// ALL matches (group AND knockout) score the same way:
//   exact score = 5 OR correct result = 3 (mutually exclusive).
// There used to be an extra +2 "who advances" bonus that stacked on
// knockout games (up to 10 pts). That bonus has been removed — knockouts
// now score identically to group games.

// Infer a match's tournament phase. Prefers the explicit `phase` field
// (stamped by syncMatches.js); falls back to the competition label for
// matches synced before that field existed.
export function phaseOf(match) {
  if (!match) return "group";
  if (match.phase === "group" || match.phase === "knockout") return match.phase;
  return match.competition && match.competition.includes("Group") ? "group" : "knockout";
}

// Score one prediction against a finished match. Returns null until the match
// is finished (or when either side is missing a usable scoreline). Otherwise:
//   { base, total, exact, result, knockout }
// Group and knockout matches are scored identically; `knockout` is carried
// through only so callers can label the match, not because it changes the
// formula.
export function scorePrediction(pred, match) {
  if (!pred || !match || match.status !== "finished") return null;
  if (pred.home == null || pred.away == null) return null;
  if (match.homeScore == null || match.awayScore == null) return null;

  const exact = pred.home === match.homeScore && pred.away === match.awayScore;
  const result =
    Math.sign(pred.home - pred.away) === Math.sign(match.homeScore - match.awayScore);

  const base = exact ? 5 : result ? 3 : 0;
  return { base, total: base, exact, result, knockout: match.phase === "knockout" };
}

// Convenience: just the integer point total (0 when unscored/unfinished).
export function scorePoints(pred, match) {
  const s = scorePrediction(pred, match);
  return s ? s.total : 0;
}
