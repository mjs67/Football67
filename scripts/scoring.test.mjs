import { scorePrediction, classifyRoastTrigger, outcomeOf } from "../src/scoring.js";

let pass = 0, fail = 0;
const M = (h, a, extra = {}) => ({ status: "finished", homeScore: h, awayScore: a, phase: "group", ...extra });
function check(name, got, exp) {
  const ok = got === exp;
  if (ok) pass++; else { fail++; console.log(`  ✗ ${name}: got ${got}, expected ${exp}`); }
}

// ── points ──
// correct result only, no exact set → 3
check("result only (scoreExact:false)",
  scorePrediction({ home: 2, away: 0, outcome: "1", scoreExact: false }, M(3, 1)).total, 3);
// user SET exact and nailed it → 5
check("exact set & correct",
  scorePrediction({ home: 3, away: 1, outcome: "1", scoreExact: true }, M(3, 1)).total, 5);
// THE FIX: 1X2-only pick whose model-default score happens to match → still 3, NOT 5
check("scoreExact:false lucky-exact = 3 (the fix)",
  scorePrediction({ home: 3, away: 1, outcome: "1", scoreExact: false }, M(3, 1)).total, 3);
// legacy pred (no scoreExact) with matching scoreline → 5 (back-compat)
check("legacy exact keeps +2",
  scorePrediction({ home: 3, away: 1 }, M(3, 1)).total, 5);
// wrong → 0
check("wrong",
  scorePrediction({ home: 0, away: 2, outcome: "2", scoreExact: false }, M(3, 1)).total, 0);

// ── banker ×2 ──
check("banker + correct result = 6",
  scorePrediction({ home: 1, away: 0, outcome: "1", scoreExact: false, isBanker: true }, M(2, 1)).total, 6);
check("banker + exact = 10",
  scorePrediction({ home: 2, away: 1, outcome: "1", scoreExact: true, isBanker: true }, M(2, 1)).total, 10);
check("banker + wrong = 0",
  scorePrediction({ home: 0, away: 1, outcome: "2", scoreExact: false, isBanker: true }, M(2, 1)).total, 0);

// ── against-the-grain (+2 when correct AND <25% picked it) ──
const lowConsensus = { pctHome: 20, pctDraw: 30, pctAway: 50 };
check("grain: correct home @20% = 5",
  scorePrediction({ home: 1, away: 0, outcome: "1", scoreExact: false }, M(2, 0), { consensus: lowConsensus }).total, 5);
check("no grain when >=25%",
  scorePrediction({ home: 0, away: 1, outcome: "2", scoreExact: false }, M(0, 2), { consensus: lowConsensus }).total, 3);
check("grain + banker = 10",
  scorePrediction({ home: 1, away: 0, outcome: "1", scoreExact: false, isBanker: true }, M(2, 0), { consensus: lowConsensus }).total, 10);
check("grain + exact = 7",
  scorePrediction({ home: 2, away: 0, outcome: "1", scoreExact: true }, M(2, 0), { consensus: lowConsensus }).total, 7);

// ── outcomeOf ──
check("outcomeOf home", outcomeOf(2, 1), "1");
check("outcomeOf draw", outcomeOf(1, 1), "X");
check("outcomeOf away", outcomeOf(0, 2), "2");

// ── roast triggers ──
check("BANKER_HIT",
  classifyRoastTrigger({ home: 1, away: 0, outcome: "1", isBanker: true }, M(2, 1)), "BANKER_HIT");
check("EXACT",
  classifyRoastTrigger({ home: 2, away: 1, outcome: "1", scoreExact: true }, M(2, 1)), "EXACT");
check("MODEL_DEFIER (correct, picked model's least likely)",
  classifyRoastTrigger({ home: 0, away: 1, outcome: "2", scoreExact: false }, M(0, 1), { modelLeast: "2", modelPick: "1" }), "MODEL_DEFIER");
check("UPSET (correct, <25% consensus, not model-defier)",
  classifyRoastTrigger({ home: 1, away: 0, outcome: "1", scoreExact: false }, M(2, 0), { consensus: { pctHome: 15, pctDraw: 35, pctAway: 50 }, modelLeast: "X", modelPick: "1" }), "UPSET");
check("COWARD (correct, >60% consensus + favourite)",
  classifyRoastTrigger({ home: 1, away: 0, outcome: "1", scoreExact: false }, M(2, 0), { consensus: { pctHome: 75, pctDraw: 15, pctAway: 10 }, modelPick: "1", modelLeast: "2" }), "COWARD");
check("STREAK_N",
  classifyRoastTrigger({ home: 1, away: 0, outcome: "1", scoreExact: false }, M(2, 0), { streak: 4 }), "STREAK_N");
check("CONFIDENT_WRONG (banker wrong)",
  classifyRoastTrigger({ home: 0, away: 2, outcome: "2", isBanker: true }, M(3, 0)), "CONFIDENT_WRONG");
check("CONTRARIAN_WRONG (defied model, lost)",
  classifyRoastTrigger({ home: 0, away: 2, outcome: "2", scoreExact: false }, M(3, 0), { modelLeast: "2", modelPick: "1" }), "CONTRARIAN_WRONG");
check("null for unremarkable correct",
  classifyRoastTrigger({ home: 1, away: 0, outcome: "1", scoreExact: false }, M(2, 0), { consensus: { pctHome: 40, pctDraw: 30, pctAway: 30 }, modelPick: "1", modelLeast: "2", streak: 1 }), null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
