/**
 * Phase 0 migration — stand up the recurring model (§12).
 * Tournament (groups→bracket) is retired; this seeds league → season → teams.
 * Fixtures/gameweeks are ingested per gameweek by syncMatches.js (Phase 1),
 * so this script deliberately does NOT create fixtures.
 *
 * Run once:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json node scripts/migrateToLeagues.js
 *
 * Idempotent: uses deterministic ids + merge, so re-running is safe.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Prefer GOOGLE_APPLICATION_CREDENTIALS; fall back to ./serviceAccountKey.json
let credential;
try {
  credential = applicationDefault();
} catch {
  const key = JSON.parse(readFileSync(join(__dirname, 'serviceAccountKey.json'), 'utf8'));
  credential = cert(key);
}
initializeApp({ credential });
const db = getFirestore();

// ---- config ----
const SEASON_LABEL = '2026/27';
const SEASON_ID = 'epl-2026-27';
const now = FieldValue.serverTimestamp();

const LEAGUES = [
  { id: 'epl',        name: 'Premier League', country: 'England', colorHex: '#3D195B', tier: 1, active: true,  externalId: 'PL'  },
  { id: 'laliga',     name: 'La Liga',        country: 'Spain',   colorHex: '#EE2523', tier: 1, active: false, externalId: 'PD'  },
  { id: 'seriea',     name: 'Serie A',        country: 'Italy',   colorHex: '#008FD7', tier: 1, active: false, externalId: 'SA'  },
  { id: 'bundesliga', name: 'Bundesliga',     country: 'Germany', colorHex: '#D20515', tier: 1, active: false, externalId: 'BL1' },
  { id: 'ligue1',     name: 'Ligue 1',        country: 'France',  colorHex: '#091C3E', tier: 1, active: false, externalId: 'FL1' },
];

async function seedLeagues() {
  const batch = db.batch();
  for (const l of LEAGUES) {
    batch.set(db.collection('leagues').doc(l.id), l, { merge: true });
  }
  await batch.commit();
  console.log(`✓ ${LEAGUES.length} leagues seeded (epl active, rest inactive for MVP)`);
}

async function seedSeason() {
  await db.collection('seasons').doc(SEASON_ID).set({
    leagueId: 'epl',
    label: SEASON_LABEL,
    startDate: null,          // set by first fixture ingest
    endDate: null,
    currentGameweek: 1,
    status: 'active',
  }, { merge: true });
  console.log(`✓ season ${SEASON_ID} (${SEASON_LABEL}) created`);
}

async function seedTeams() {
  const { teams } = JSON.parse(readFileSync(join(__dirname, 'eplTeams.json'), 'utf8'));
  const batch = db.batch();
  for (const t of teams) {
    batch.set(db.collection('teams').doc(t.id), {
      name: t.name,
      shortCode: t.shortCode,
      leagueId: 'epl',
      colorHex: t.colorHex,
      crestUrl: '',            // monograms at MVP (§15.1)
      recentForm: [],
    }, { merge: true });
  }
  await batch.commit();
  console.log(`✓ ${teams.length} EPL teams seeded (monograms, no crests)`);
}

async function seedFirstGameweekShell() {
  // Optional shell so onboarding has a gameweek to land on before Phase-1 ingest.
  // status 'scheduled' + no fixtures → app shows the "gameweek not open yet" empty state.
  const gwId = `${SEASON_ID}-gw1`;
  await db.collection('gameweeks').doc(gwId).set({
    seasonId: SEASON_ID,
    leagueId: 'epl',
    number: 1,
    opensAt: null,
    firstKickoff: null,
    lastKickoff: null,
    settledAt: null,
    status: 'scheduled',
  }, { merge: true });
  console.log(`✓ gameweek shell ${gwId} created (scheduled, no fixtures yet)`);
}

async function main() {
  await seedLeagues();
  await seedSeason();
  await seedTeams();
  await seedFirstGameweekShell();
  console.log('\nPhase 0 migration complete. Next: Phase 1 syncMatches.js ingests fixtures.');
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
