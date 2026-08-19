// Builds the ML training table: one row per FINISHED match with its
// PRE-MATCH feature vector (computed only from matches BEFORE its kickoff) and
// the actual scoreline as the label. This "as-of" discipline is the whole
// point — computing strength/form/H2H from the full season (as syncMatches.js
// does for live cards) would leak the future into training and flatter every
// offline metric.
//
// Feature keys match ml/models.py FEATURE_ORDER. Mirrors the exact
// strength/rating/form/H2H logic in syncMatches.js so training and serving see
// the same feature definitions.
//
// Usage:
//   FOOTBALL_DATA_TOKEN=... COMPETITION=WC node scripts/exportTrainingData.js
//   # multiple competitions -> more data:
//   COMPETITIONS=WC,EC,PL node scripts/exportTrainingData.js
import { readFileSync, writeFileSync } from "node:fs";
import { teamName } from "./stages.js";

const TOKEN = process.env.FOOTBALL_DATA_TOKEN;
if (!TOKEN) { console.error("Missing FOOTBALL_DATA_TOKEN"); process.exit(1); }
const COMPS = (process.env.COMPETITIONS || process.env.COMPETITION || "WC")
  .split(",").map((s) => s.trim()).filter(Boolean);

let ratings = {};
try {
  ratings = JSON.parse(readFileSync(new URL("./teamRatings.json", import.meta.url), "utf8"));
} catch { /* optional */ }
const DEFAULT_RATING = 1600;
const ratingOf = (t) =>
  Object.prototype.hasOwnProperty.call(ratings, t) ? ratings[t] : DEFAULT_RATING;

async function fetchSeason(comp) {
  const r = await fetch(
    `https://api.football-data.org/v4/competitions/${comp}/matches`,
    { headers: { "X-Auth-Token": TOKEN } }
  );
  if (!r.ok) { console.error(`${comp}: HTTP ${r.status}`); return []; }
  const d = await r.json();
  return d.matches.map((m) => ({ ...m, _comp: comp }));
}

// Feature builder over a chronological list of prior finished matches.
function featuresAsOf(prior, home, away, neutral) {
  const stats = new Map();
  const form = new Map();
  let gH = 0, gA = 0, n = 0;
  for (const m of prior) {
    const h = teamName(m.homeTeam), a = teamName(m.awayTeam);
    const hs = m.score.fullTime.home, as = m.score.fullTime.away;
    gH += hs; gA += as; n += 1;
    for (const [t, gf, ga] of [[h, hs, as], [a, as, hs]]) {
      const s = stats.get(t) || { gf: 0, ga: 0, n: 0 };
      s.gf += gf; s.ga += ga; s.n += 1; stats.set(t, s);
    }
    const push = (t, r) => form.set(t, [...(form.get(t) || []), r]);
    if (hs > as) { push(h, "W"); push(a, "L"); }
    else if (hs < as) { push(h, "L"); push(a, "W"); }
    else { push(h, "D"); push(a, "D"); }
  }
  let gHome = n >= 10 ? gH / n : 1.45;
  let gAway = n >= 10 ? gA / n : 1.15;
  if (neutral) gHome = gAway = n >= 10 ? (gH + gA) / (2 * n) : 1.3;
  const gAvg = (gHome + gAway) / 2;
  const strength = (t) => {
    const s = stats.get(t);
    if (!s || !s.n) return { att: 1, def: 1, n: 0 };
    const w = s.n / (s.n + 5);
    return { att: w * (s.gf / s.n / gAvg) + (1 - w),
             def: w * (s.ga / s.n / gAvg) + (1 - w), n: s.n };
  };
  const countForm = (t) => {
    const f = (form.get(t) || []).slice(-5);
    return { w: f.filter((x) => x === "W").length,
             d: f.filter((x) => x === "D").length,
             l: f.filter((x) => x === "L").length };
  };
  const h2h = (() => {
    let hw = 0, dr = 0, aw = 0;
    for (const m of prior) {
      const h = teamName(m.homeTeam), a = teamName(m.awayTeam);
      if (!((h === home && a === away) || (h === away && a === home))) continue;
      const hs = m.score.fullTime.home, as = m.score.fullTime.away;
      if (hs === as) dr++; else if ((hs > as ? h : a) === home) hw++; else aw++;
    }
    return { hw, dr, aw };
  })();
  const H = strength(home), A = strength(away);
  const fH = countForm(home), fA = countForm(away);
  return {
    home_rating: ratingOf(home), away_rating: ratingOf(away),
    rating_diff: ratingOf(home) - ratingOf(away) + (neutral ? 0 : 60),
    neutral: neutral ? 1 : 0,
    home_att: H.att, home_def: H.def, away_att: A.att, away_def: A.def,
    home_n: H.n, away_n: A.n, g_home: gHome, g_away: gAway,
    home_w: fH.w, home_d: fH.d, home_l: fH.l,
    away_w: fA.w, away_d: fA.d, away_l: fA.l,
    h2h_home: h2h.hw, h2h_draw: h2h.dr, h2h_away: h2h.aw,
  };
}

const out = [];
for (const comp of COMPS) {
  const neutral = ["WC", "EC"].includes(comp);
  const season = (await fetchSeason(comp))
    .filter((m) => m.status === "FINISHED")
    .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
  season.forEach((m, i) => {
    const prior = season.slice(0, i); // strictly before this kickoff
    const home = teamName(m.homeTeam), away = teamName(m.awayTeam);
    out.push({
      id: `fd_${m.id}`, kickoff: m.utcDate, competition: comp,
      ...featuresAsOf(prior, home, away, neutral),
      homeScore: m.score.fullTime.home, awayScore: m.score.fullTime.away,
    });
  });
  console.log(`${comp}: ${season.length} finished matches`);
}

const outPath = "./scripts/training_data.json";
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`Wrote ${out.length} rows -> ${outPath}`);
process.exit(0);
