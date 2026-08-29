// src/scoring.js
// Single source of truth for prediction scoring. PURE functions only — no
// Firebase, no DOM, no Vite-only syntax — so both the browser app (src/) and
// the Node automation scripts (scripts/) import the very same rules.
//
// v2 scoring (§4):
//   correct result (1X2) ............ +3
//   correct EXACT score ............. +2 bonus (5 total) — only when the user
//                                     actually SET an exact score (scoreExact)
//   against-the-grain ............... +2 bonus (correct AND <25% consensus)
//   Banker correct .................. ×2 the fixture's total points
//   wrong ........................... 0
//
// Back-compat: predictions made before the v2 fields existed have no
// `scoreExact` / `isBanker` / `outcome`. Those are treated as exact-eligible
// (so historical exact picks keep their +2) and non-banker, and their outcome
// is inferred from the stored scoreline. Passing no `consensus` simply skips
// the against-the-grain bonus — so every legacy caller keeps working.

export function outcomeOf(home, away) {
  return home > away ? "1" : home === away ? "X" : "2";
}

// Infer a match's tournament phase. Prefers the explicit `phase` field
// (stamped by syncMatches.js); falls back to the competition label.
export function phaseOf(match) {
  if (!match) return "group";
  if (match.phase === "group" || match.phase === "knockout") return match.phase;
  return match.competition && match.competition.includes("Group") ? "group" : "knockout";
}

// The consensus % of users who backed the SAME outcome the prediction did.
// `consensus` is the match's { pctHome, pctDraw, pctAway } (0–100). Returns
// null when no consensus is available (grain bonus then does not apply).
function pickedConsensusPct(pred, consensus) {
  if (!consensus) return null;
  const oc = pred.outcome || outcomeOf(pred.home, pred.away);
  if (oc === "1") return consensus.pctHome;
  if (oc === "X") return consensus.pctDraw;
  return consensus.pctAway;
}

// Score one prediction against a finished match. Returns null until the match
// is finished (or when either side is missing a usable scoreline). Otherwise:
//   { base, total, exact, result, grain, banker, knockout }
//   base  = points before the banker multiplier (result/exact + grain)
//   total = base, doubled when a banker pick scored
export function scorePrediction(pred, match, opts = {}) {
  if (!pred || !match || match.status !== "finished") return null;
  if (pred.home == null || pred.away == null) return null;
  if (match.homeScore == null || match.awayScore == null) return null;

  const result =
    Math.sign(pred.home - pred.away) === Math.sign(match.homeScore - match.awayScore);

  // Exact bonus only when the user SET an exact score. A 1X2-only pick stores
  // a model-default scoreline with scoreExact:false and must NOT earn the +2
  // even if that scoreline happens to be right. Legacy picks (field absent)
  // stay exact-eligible.
  const exactEligible = pred.scoreExact !== false;
  const exact =
    exactEligible && pred.home === match.homeScore && pred.away === match.awayScore;

  let base = exact ? 5 : result ? 3 : 0;

  // Against-the-grain: a correct pick that fewer than 25% of users backed.
  const grainPct = pickedConsensusPct(pred, opts.consensus);
  const grain = result && grainPct != null && grainPct < 25;
  if (grain) base += 2;

  // Banker: doubles the fixture's total points when the pick scored.
  const banker = !!pred.isBanker && base > 0;
  const total = banker ? base * 2 : base;

  return { base, total, exact, result, grain, banker, knockout: match.phase === "knockout" };
}

// Convenience: just the integer point total (0 when unscored/unfinished).
export function scorePoints(pred, match, opts = {}) {
  const s = scorePrediction(pred, match, opts);
  return s ? s.total : 0;
}

// ── Roast trigger classification (§5.1) ──────────────────────────────
// Pure classifier: given the settled prediction + context, return the single
// most share-worthy trigger key (or null for an unremarkable pick). Phase 4's
// roastGeneration.js maps trigger + severity → template text and writes the
// roast doc; Phase 3 only decides WHICH trigger fires.
//
// ctx = {
//   consensus,          // { pctHome, pctDraw, pctAway }
//   streak,             // this user's consecutive-correct count INCLUDING this match
//   modelPick,          // "1"|"X"|"2" the model rated most likely
//   modelLeast,         // "1"|"X"|"2" the model rated least likely
// }
export function classifyRoastTrigger(pred, match, ctx = {}) {
  const s = scorePrediction(pred, match, { consensus: ctx.consensus });
  if (!s) return null;

  const oc = pred.outcome || outcomeOf(pred.home, pred.away);
  const pickedPct = pickedConsensusPct(pred, ctx.consensus);
  const banker = !!pred.isBanker;

  if (s.result) {
    // Correct — ordered by how good a story it makes.
    if (banker) return "BANKER_HIT";
    if (s.exact) return "EXACT";
    if ((ctx.streak || 0) >= 3) return "STREAK_N";
    if (ctx.modelLeast && oc === ctx.modelLeast) return "MODEL_DEFIER";
    if (pickedPct != null && pickedPct < 25) return "UPSET";
    if (pickedPct != null && pickedPct > 60 && ctx.modelPick && oc === ctx.modelPick) return "COWARD";
    return null; // correct but unremarkable
  }

  // Wrong.
  if (banker) return "CONFIDENT_WRONG";
  if (ctx.modelLeast && oc === ctx.modelLeast) return "CONTRARIAN_WRONG";
  return null; // a plain miss
}
