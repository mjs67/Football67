// Poisson scoreline model — shared client-side math.
// The sync job stores expected goals (lh, la) on each match; everything
// else (win/draw/win %, most likely score, probability of any scoreline)
// is derived here from those two numbers.
const MAX_GOALS = 8;

export function poissonP(k, lambda) {
  let fact = 1;
  for (let i = 2; i <= k; i++) fact *= i;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / fact;
}

export function scoreP(lh, la, h, a) {
  return poissonP(h, lh) * poissonP(a, la);
}

export function matchProbs(lh, la) {
  let ph = 0, pd = 0, pa = 0;
  let top = { h: 0, a: 0, p: 0 };
  for (let h = 0; h <= MAX_GOALS; h++) {
    for (let a = 0; a <= MAX_GOALS; a++) {
      const p = scoreP(lh, la, h, a);
      if (h > a) ph += p;
      else if (h === a) pd += p;
      else pa += p;
      if (p > top.p) top = { h, a, p };
    }
  }
  return { ph, pd, pa, top };
}

// Knockout prediction: a knockout can't stand level, so collapse the draw.
// Take the most likely scoreline — if it's decisive, the winning side
// advances in regulation; if it's level, treat the tie as going to a
// shootout and award it to the side with the higher regulation win prob.
// NOTE: the model only knows expected goals. "penalties" here means
// "most likely to finish level", NOT an actual shootout prediction.
// Returns { advancer: "H" | "A", decided: "regulation" | "penalties", h, a, p }.
export function predictKnockout(lh, la) {
  const { ph, pa, top } = matchProbs(lh, la);
  if (top.h !== top.a) {
    return { advancer: top.h > top.a ? "H" : "A", decided: "regulation", h: top.h, a: top.a, p: top.p };
  }
  return { advancer: ph >= pa ? "H" : "A", decided: "penalties", h: top.h, a: top.a, p: top.p };
}

// Method B: pick whichever of ph/pd/pa is highest as the predicted result.
// More accurate than reading the result off the single most-likely scoreline
// (top), because home-win probability is spread across many scorelines
// (1-0, 2-0, 2-1, …) while the top scoreline often under-represents it.
// Returns "H" | "D" | "A".
export function predict1x2(lh, la) {
  const { ph, pd, pa } = matchProbs(lh, la);
  if (ph >= pd && ph >= pa) return "H";
  if (pd >= ph && pd >= pa) return "D";
  return "A";
}

export function pct(p) {
  const n = p * 100;
  if (n > 0 && n < 1) return "<1";
  return String(Math.round(n));
}

// Which side ("home" | "away") went through from a finished knockout tie,
// or null. The sync (syncMatches.js) resolves the real winner into
// `advancedTeam` even when the full-time score is level (ET/penalties).
// Falls back to the scoreline for a decisive knockout that lacks the field.
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

// Single source of truth for scoring one prediction against a finished match.
// GROUP games: exact score = 5 OR correct result = 3 (mutually exclusive).
// KNOCKOUT games: the three components STACK —
//   exact score        +5
//   correct result     +3   (always also true when the score is exact)
//   who advances        +2   (predicted advancer == the side that went through,
//                             whether decided in 90 mins, ET, or penalties)
//   → up to 10 points on a perfect knockout call.
// Returns null until the match is finished.
export function scorePrediction(pred, match) {
  if (!pred || !match || match.status !== "finished") return null;

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
