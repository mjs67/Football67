// src/playerRoasts.js
// Player-profile roasts for the leaderboard modal. Unlike the match-level
// roasts in scripts/roastTemplates.js, these are keyed on a player's OVERALL
// leaderboard rank, so every player has one regardless of whether they ever
// topped a match.
//
// Selection is deterministic: a given uid always draws the same line from its
// tier's pool, so the roast only changes when the player's rank crosses into a
// different tier. No writes, no storage — computed on open from rank + uid.
//
// Tiers (overall rank):
//   1        → LEADER  : pure luck, zero knowledge, "first/top" language
//   2–3      → PODIUM  : lucky, no knowledge, but never claims the lead
//   4–10     → TRYHARD : tries far too hard, still bad
//   11–15    → AVERAGE : at peace with being mid-table forever
//   16+      → VICTIM  : so bad it's reframed as persecution
//
// {name} is the only variable — interpolated by roastForRank().

const LEADER = [
  "Sitting pretty at the very top and couldn't name a single starting XI at gunpoint. {name} is living proof that a blindfolded dart still hits the board sometimes.",
  "First place built entirely on luck so pure it belongs in a lab. {name} has never survived a full 90 minutes and every thoughtless pick shows it.",
  "Leading the whole league while genuinely believing offside is a type of parking. The universe is rigged for {name}, because skill left this conversation long ago.",
  "Top of the table, rock bottom of the football IQ rankings. {name} picks winners the way a toddler picks lottery numbers — and somehow it keeps landing.",
  "Number one on a streak so absurd that {name} now mistakes it for talent. It isn't. It never was. Enjoy the view while the coin still lands your way.",
  "First in the league and dead last in actual knowledge — {name} is a cosmic accident no bookmaker on earth could have priced.",
];

const PODIUM = [
  "On the podium purely because the coin kept landing right for {name}. Knowledge: zero. Nerve to act proud about it: infinite.",
  "Clinging to a top-three spot with the football wisdom of a parking cone. {name} guessed their way here and everyone can see the seams.",
  "Third-hand luck dressed up as insight — {name} couldn't explain the offside rule with a diagram and a week to prepare, yet here they are near the summit.",
  "Riding shotgun near the top on nothing but hunches and highlight reels. Darwin would be disturbed by the survival of {name}.",
  "A podium finish assembled from pure chance and other people's mistakes. {name} is a bystander who wandered into a medal ceremony.",
  "So close to the top and so far from deserving it — the entire run of {name} is a fluke that simply hasn't collapsed yet.",
];

const TRYHARD = [
  "Studies the fixtures like a final exam and still lands in the mushy middle. All that effort, {name}, and the reward is mediocrity with homework.",
  "Watches every pre-match breakdown, reads every stat, then predicts like they've never seen a ball roll. Full marks for effort, {name}, none for results.",
  "The spreadsheet of {name} has more tabs than a browser crash and the points still refuse to show. Trying hard has never looked this pointless.",
  "Puts in the hours of a professional analyst to produce the output of a broken calculator. Nobody works this hard to stay this average, {name}.",
  "The dedication of {name} is genuinely admirable and completely wasted — all that research just to finish behind people who flat-out guessed.",
  "Grinds tactics videos at midnight and still gets outscored by pure chaos merchants. The effort-to-result ratio of {name} is a tragedy in real time.",
  "The harder {name} works, the worse it gets, which is almost a scientific marvel. Somewhere a coach is quietly weeping.",
];

const AVERAGE = [
  "Firmly planted mid-table and finally at peace with it. This is the ceiling for {name} — no higher, no lower, just eternally fine.",
  "The mid-table energy of {name} is almost inspiring. They've stopped dreaming, and honestly, so should the rest of us on their behalf.",
  "Average today, average tomorrow, average when the trophy is handed out. {name} has accepted the beige truth, and we respect the surrender.",
  "This is as good as it gets, {name}, and somewhere deep down you already know it. Pull up a chair in the middle of the table — you live here now.",
  "Not good enough to brag, not bad enough to pity. {name} has perfected the art of being completely forgettable.",
];

const VICTIM = [
  "Buried in the bottom half and somehow it's everyone else's fault. The picks of {name} are dreadful, but the excuses are Olympic-level.",
  "Every wrong prediction arrives with a conspiracy theory attached. {name} isn't bad at this — the game, the app, and the universe are all against them, apparently.",
  "So far down the table that {name} has rebranded losing as \"being sabotaged.\" Bold strategy. Still sinking, though.",
  "The results of {name} are a disaster and the victim speech is already written. Nobody rigged this — you're simply, genuinely this bad.",
  "Bottom of the barrel and blaming the barrel. {name} would rather play martyr than admit the predictions were never any good.",
  "Rock bottom and convinced it's persecution. The truth is simpler, {name}: you're not oppressed, you're just genuinely awful at this.",
];

// Stable, fast string hash (djb2-ish) → non-negative int. Same uid → same
// index every time, so the roast is deterministic within a tier.
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function poolForRank(rank) {
  if (rank <= 1) return LEADER;
  if (rank <= 3) return PODIUM;
  if (rank <= 10) return TRYHARD;
  if (rank <= 15) return AVERAGE;
  return VICTIM; // 16th and below, however large the league
}

// rank: 1-based overall leaderboard position. uid: stable id for deterministic
// pick. name: display name to interpolate. Returns the finished roast string.
export function roastForRank(rank, uid, name) {
  const pool = poolForRank(rank);
  const line = pool[hashStr(uid || name || "") % pool.length];
  // Function replacer so a name containing `$` (e.g. "$teve") can't trigger
  // special replacement patterns like $& / $1.
  return line.replace(/\{name\}/g, () => name);
}

// Exported for tests / previewing every line if ever needed.
export const PLAYER_ROAST_POOLS = { LEADER, PODIUM, TRYHARD, AVERAGE, VICTIM };
