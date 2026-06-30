// src/scoring.js
// Single source of truth for prediction scoring. PURE functions only — no
// Firebase, no DOM, no Vite-only syntax — so both the browser app (src/) and
// the Node automation scripts (scripts/) import the very same rules.
//
// Before this module existed the same logic was hand-copied into poisson.js,
// recompute.js, roastGeneration.js and shareCard.js. Two of those copies had
// silently drifted: the roast + share-card scorers only ever returned 5/3/0
// and ignored knockout stacking, so a perfect 10-point knockout call was
// scored as 5 (mis-targeting roasts, understating points). Change the rules
// HERE, once, and every surface stays in agreement.
//
// GROUP games: exact score = 5 OR correct result = 3 (mutually exclusive).
// KNOCKOUT games: the three components STACK —
//   exact score    +5
//   correct result +3   (always also true when the score is exact)
//   who advances    +2   (predicted advancer == the side that went through,
//                         whether decided in 90 mins, ET, or penalties)
//   -> up to 10 points on a perfect knockout call.

// Infer a match's tournament phase. Prefers the explicit `phase` field
// (stamped by syncMatches.js); falls back to the competition label for
// matches synced before that field existed.
export function phaseOf(match) {
  if (!match) return "group";
  if (match.phase === "group" || match.phase === "knockout") return match.phase;
  return match.competition && match.competition.includes("Group") ? "group" : "knockout";
}

// Which side ("home" | "away") actually advanced from a finished knockout tie,
// or null. syncMatches.js resolves the real winner into `advancedTeam` even
// when the full-time score is level (ET/penalties); we fall back to the
// scoreline for a decisive knockout that lacks the field.
export function advancedSide(match) {
  if (!match || match.phase !== "knockout") return null;
  if (match.advancedTeam && match.advancedTeam === match.home) return "home";
  if (match.advancedTeam && match.advancedTeam === match.away) return "away";
  if (
    match.status === "finished" &&
    match.homeScore != null &&
    match.awayScore != null &&
    match.homeScore !== match.awayScore
  ) {
    return match.homeScore > match.awayScore ? "home" : "away";
  }
  return null; // level with no resolved winner — genuinely undecided
}

// Which side a prediction backs to advance. A decisive scoreline implies its
// own winner; a level scoreline uses the explicit shootout pick (pred.advance).
export function predictedAdvanceSide(pred) {
  if (!pred) return null;
  if (pred.home > pred.away) return "home";
  if (pred.away > pred.home) return "away";
  return pred.advance ?? null;
}

// Score one prediction against a finished match. Returns null until the match
// is finished (or when either side is missing a usable scoreline). Otherwise:
//   { base, bonus, total, exact, result, advanceHit, knockout }
//
// Note: the knockout/group split keys off the LITERAL match.phase field, so
// callers that want phase *inferred* for legacy matches should normalise it
// first, e.g. scorePrediction(pred, { ...m, phase: phaseOf(m) }).
export function scorePrediction(pred, match) {
  if (!pred || !match || match.status !== "finished") return null;
  if (pred.home == null || pred.away == null) return null;
  if (match.homeScore == null || match.awayScore == null) return null;

  const exact = pred.home === match.homeScore && pred.away === match.awayScore;
  const result =
    Math.sign(pred.home - pred.away) === Math.sign(match.homeScore - match.awayScore);

  if (match.phase !== "knockout") {
    const base = exact ? 5 : result ? 3 : 0;
    return { base, bonus: 0, total: base, exact, result, advanceHit: false, knockout: false };
  }

  const base = (exact ? 5 : 0) + (result ? 3 : 0);
  const actual = advancedSide(match);
  const mine = predictedAdvanceSide(pred);
  const advanceHit = !!actual && !!mine && actual === mine;
  const bonus = advanceHit ? 2 : 0;
  return { base, bonus, total: base + bonus, exact, result, advanceHit, knockout: true };
}

// Convenience: just the integer point total (0 when unscored/unfinished).
export function scorePoints(pred, match) {
  const s = scorePrediction(pred, match);
  return s ? s.total : 0;
}
