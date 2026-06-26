// checkPassStats.js
// Checks whether API-Football has pass statistics for WC2026 finished matches.
//
// Usage:
//   API_FOOTBALL_KEY=your_key_here node checkPassStats.js
//
// Get a free key at: https://dashboard.api-football.com/register
// (100 requests/day free, no credit card)

/*const KEY = process.env.API_FOOTBALL_KEY;*/

const KEY = process.env.API_FOOTBALL_KEY || "2da889bb8bf64e24ad6bc9f1e98641db";

if (!KEY) {
  console.error("❌  Set API_FOOTBALL_KEY env var first.");
  console.error("    e.g.  API_FOOTBALL_KEY=abc123 node checkPassStats.js");
  process.exit(1);
}

const BASE = "https://v3.football.api-sports.io";
const HEADERS = {
  "x-apisports-key": KEY,
  "Content-Type": "application/json",
};

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${path}`);
  const json = await res.json();
  if (json.errors && Object.keys(json.errors).length > 0) {
    throw new Error(JSON.stringify(json.errors));
  }
  return json.response;
}

// ── Step 1: verify coverage flags for WC2026 ────────────────────────────────
console.log("\n📋  Step 1 — Checking WC2026 coverage flags (league=1, season=2026)…");
const [league] = await get("/leagues?id=1&season=2026");
const cov = league?.seasons?.[0]?.coverage ?? league?.coverage;
console.log("Coverage:", JSON.stringify(cov, null, 2));

const statsSupported =
  cov?.fixtures?.statistics_fixtures === true ||
  cov?.fixtures?.statistics_fixtures === "true";
console.log(
  statsSupported
    ? "✅  statistics_fixtures = true — stats endpoint is supported for this competition."
    : "⚠️   statistics_fixtures is NOT true — pass data likely unavailable."
);

// ── Step 2: grab a handful of finished WC2026 fixtures ──────────────────────
console.log("\n📋  Step 2 — Fetching finished WC2026 fixtures…");
const fixtures = await get(
  "/fixtures?league=1&season=2026&status=FT&timezone=UTC"
);
console.log(`Found ${fixtures.length} finished fixture(s) so far.`);

if (fixtures.length === 0) {
  console.log("No finished fixtures yet — run this again after a match ends.");
  process.exit(0);
}

// Pick up to 3 finished matches to sample
const samples = fixtures.slice(0, 3);

// ── Step 3: hit the statistics endpoint for each sample ─────────────────────
console.log("\n📋  Step 3 — Fetching statistics for each sample match…\n");

let foundPasses = false;

for (const f of samples) {
  const id = f.fixture.id;
  const home = f.teams.home.name;
  const away = f.teams.away.name;
  const score = `${f.goals.home ?? "?"}-${f.goals.away ?? "?"}`;
  console.log(`─────────────────────────────────────`);
  console.log(`⚽  ${home} ${score} ${away}  (fixture id: ${id})`);

  let stats;
  try {
    stats = await get(`/fixtures/statistics?fixture=${id}`);
  } catch (e) {
    console.log(`   ❌  Error fetching stats: ${e.message}`);
    continue;
  }

  if (!stats || stats.length === 0) {
    console.log("   ⚠️   No statistics returned (empty array).");
    continue;
  }

  for (const teamBlock of stats) {
    const teamName = teamBlock.team.name;
    const statList = teamBlock.statistics ?? [];

    const passTotal = statList.find((s) => s.type === "Passes Total")?.value;
    const passAccurate = statList.find((s) => s.type === "Passes Accurate")?.value;
    const possession = statList.find((s) => s.type === "Ball Possession")?.value;
    const shotsTotal = statList.find((s) => s.type === "Shots on Goal")?.value;

    console.log(`\n   🟦  ${teamName}`);
    console.log(`       Passes Total:    ${passTotal ?? "null (not available)"}`);
    console.log(`       Passes Accurate: ${passAccurate ?? "null (not available)"}`);

    if (passTotal != null && passAccurate != null) {
      const pct = Math.round((passAccurate / passTotal) * 100);
      console.log(`       ✅  Pass completion: ${pct}%  (derived: ${passAccurate}/${passTotal})`);
      foundPasses = true;
    } else {
      console.log(`       ❌  Pass data missing — can't compute completion %.`);
    }

    console.log(`       Possession:      ${possession ?? "null"}`);
    console.log(`       Shots on Goal:   ${shotsTotal ?? "null"}`);

    // Show all available stat types so you know exactly what you have
    if (statList.length > 0) {
      const types = statList.map((s) => `${s.type}: ${s.value}`).join(", ");
      console.log(`\n       All stats: ${types}`);
    }
  }
}

// ── Summary ─────────────────────────────────────────────────────────────────
console.log("\n═════════════════════════════════════════");
if (foundPasses) {
  console.log("✅  VERDICT: Pass data IS available for WC2026 on API-Football.");
  console.log("   You can derive completion % as: Math.round(Passes Accurate / Passes Total * 100)");
} else {
  console.log("❌  VERDICT: Pass data is NOT available for these WC2026 matches.");
  console.log("   Either the coverage flag is false, or FIFA isn't providing this stat to the API.");
}
console.log("═════════════════════════════════════════\n");
