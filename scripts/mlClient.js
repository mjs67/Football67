// Serves the trained goal model INSIDE the existing sync — no API, no cloud.
// train.py exports the linear (GLM) model as ml/model.json (raw-feature
// coefficients, scaler already folded in), so inference here is a plain
// exp(intercept + coef·x). buildFeatures() turns the values syncMatches.js
// already has in scope into the feature vector. If model.json is missing or
// malformed, predictGoals() returns null and the caller falls back to the
// built-in expectedGoals() blend — so the sync never breaks.
//
// Feature keys/order are defined by model.json.feature_order, which matches
// ml/models.py FEATURE_ORDER and scripts/exportTrainingData.js.
import { readFileSync } from "node:fs";

const MODEL_PATH = process.env.ML_MODEL_PATH
  ? new URL(process.env.ML_MODEL_PATH, `file://${process.cwd()}/`)
  : new URL("../ml/model.json", import.meta.url);

let model = null;
try {
  model = JSON.parse(readFileSync(MODEL_PATH, "utf8"));
} catch {
  console.log("No ml/model.json found — odds will use the built-in blend.");
}

function formCounts(s) {
  const f = (s || "").slice(-5).split("");
  return { w: f.filter((x) => x === "W").length,
           d: f.filter((x) => x === "D").length,
           l: f.filter((x) => x === "L").length };
}

// `strengthOf(team)` -> {att,def,n}; `ratingOf(team)` -> number; both are the
// closures syncMatches.js already defines. `h2h` is its h2h() result or null.
export function buildFeatures({ home, away, neutral, strengthOf, ratingOf,
                                homeForm, awayForm, h2h, gHome, gAway }) {
  const H = strengthOf(home), A = strengthOf(away);
  const fH = formCounts(homeForm), fA = formCounts(awayForm);
  return {
    home_rating: ratingOf(home), away_rating: ratingOf(away),
    rating_diff: ratingOf(home) - ratingOf(away) + (neutral ? 0 : 60),
    neutral: neutral ? 1 : 0,
    home_att: H.att, home_def: H.def, away_att: A.att, away_def: A.def,
    home_n: H.n, away_n: A.n, g_home: gHome, g_away: gAway,
    home_w: fH.w, home_d: fH.d, home_l: fH.l,
    away_w: fA.w, away_d: fA.d, away_l: fA.l,
    h2h_home: h2h?.homeWins ?? 0, h2h_draw: h2h?.draws ?? 0,
    h2h_away: h2h?.awayWins ?? 0,
  };
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

function side(sideParams, vec) {
  let s = sideParams.intercept;
  for (let i = 0; i < vec.length; i++) s += sideParams.coef[i] * vec[i];
  return Math.exp(s);
}

// Returns {lh, la, n, source:"ml"} in the same shape as expectedGoals(), or
// null if no model is loaded so the caller can fall back.
export function predictGoals(features) {
  if (!model) return null;
  const vec = model.feature_order.map((k) => Number(features[k]));
  const [lo, hi] = model.clamp || [0.25, 3.6];
  const lh = Number(clamp(side(model.home, vec), lo, hi).toFixed(3));
  const la = Number(clamp(side(model.away, vec), lo, hi).toFixed(3));
  return { lh, la, n: (features.home_n || 0) + (features.away_n || 0), source: "ml" };
}
