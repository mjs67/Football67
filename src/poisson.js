// Poisson scoreline model — shared client-side math.
// The sync job stores expected goals (lh, la) on each match; everything
// else (win/draw/win %, most likely score, probability of any scoreline)
// is derived here from those two numbers.
//
// Scoring (scorePrediction / advancedSide / predictedAdvanceSide / phaseOf)
// now lives in ./scoring.js — a framework-free module shared with the Node
// scripts — and is re-exported here so existing `from "../poisson.js"`
// imports keep working unchanged.
const MAX_GOALS = 8;

export {
  scorePrediction,
  scorePoints,
  advancedSide,
  predictedAdvanceSide,
  phaseOf,
} from "./scoring.js";

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

// The AI model's own prediction for a match (top scoreline + implied/most-
// likely advancer on knockouts), scored under the same rules as the player.
// Centralised here so My Picks and the match cards derive it the same way.
// Returns null when the match has no odds yet.
export function aiPredictionFor(match) {
  if (!match || !match.odds) return null;
  const { top } = matchProbs(match.odds.lh, match.odds.la);
  const pred = { home: top.h, away: top.a };
  if (match.phase === "knockout" && top.h === top.a) {
    pred.advance =
      predictKnockout(match.odds.lh, match.odds.la).advancer === "H" ? "home" : "away";
  }
  return pred;
}
