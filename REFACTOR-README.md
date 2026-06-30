# Football67 — de-duplication refactor

This package eliminates the duplicated/drifted logic across the app and the
automation scripts by introducing a small set of shared modules and pointing
every existing call site at them. Drop the `src/` and `scripts/` folders over
your repo (same paths). **No data, schema, or Firestore rules change.**

Net shape: **7 files added, 22 updated, 0 deleted** (one inline wrapper,
`Groups.jsx`'s `revealScore`, was removed). `checkPassStats.js` was left
untouched — it's an unrelated one-off probe, not part of the duplication.

## What was wrong, and what each new module fixes

The big one: **`scorePrediction` existed in four places and two had drifted.**
The canonical version (group: exact 5 / result 3; knockout: exact +5, result
+3, advancer +2, stacking to 10) lived in `poisson.js`, was mirrored exactly
in `recompute.js`, but the roast generator and the share-card carried a
**simplified 5/3/0 copy with no knockout awareness.** That under-counted
knockout results and could mis-target a roast. All four now call one module.

New shared modules:

- `src/scoring.js` — the single source of truth for scoring. Pure (no
  Firebase, no DOM), so the browser app **and** the Node scripts import it.
- `src/shareCanvas.js` — shared canvas kit (palette, wordmark, footer,
  rounded-rects, text wrap, share/download) for the two PNG share cards.
- `src/nameUtils.js` — `displayNameOf` / `firstNameOf` (was inlined 5×).
- `src/standings.js` — `compareStandings`, the leaderboard tiebreak chain
  (was duplicated in Leaderboard, Groups, and the roast targeting).
- `src/components/PlayerIdentity.jsx` — `<Flag>` and `<Avatar>`.
- `scripts/admin.js` — one firebase-admin init + `db` export (was copy-pasted
  in 11 scripts, in 3 slightly different flavours).
- `scripts/stages.js` — knockout stage constants + `teamName` / `stageLabel`.

## One intentional behaviour change

Roasts and the picks share-card now score knockout games with the **real
stacking rules** instead of the old 5/3/0. This is the whole point of the
consolidation — it fixes understated knockout points and roast mis-targeting.
**All group-stage scoring is byte-identical** to before (see verification).
Everything else is a pure internal refactor with no behavioural change.

The roast generators take an optional finished-match argument carrying
phase + who-advanced. When present (both callers now pass it), knockout
scoring applies; when absent it falls back to group scoring — so the change
degrades safely.

## Verification (you can re-run these)

- `node tests/parity.test.mjs` — exhaustively compares the new `scoring.js`
  against a verbatim copy of the **current shipping** `poisson.js` scorer over
  **34,994 cases → 0 mismatches**, and confirms a perfect knockout call = 10.
  This proves switching every call site to `scoring.js` cannot change any
  score the app already produces.
- `node tests/smoke.test.mjs` — 24 behavioural checks across the new pure
  modules (names, standings sort, stages, AI prediction, scoring).

Also checked during build: `node --check` on every `.js`, esbuild transpile of
every `.jsx`, and an esbuild bundle of the full import graph (client entry +
all 14 script entries) to confirm every local import path resolves and every
named export lines up.

## Files in this package

Added: `src/scoring.js`, `src/shareCanvas.js`, `src/nameUtils.js`,
`src/standings.js`, `src/components/PlayerIdentity.jsx`, `scripts/admin.js`,
`scripts/stages.js`.

Updated — client: `src/poisson.js` (re-exports scoring, adds
`aiPredictionFor`), `src/App.jsx`, `src/shareCard.js`,
`src/components/MatchCard.jsx`, `MyPicks.jsx`, `Leaderboard.jsx`,
`Groups.jsx`, `MatchRoast.jsx`.

Updated — scripts: `recompute.js`, `roastGeneration.js`, `syncMatches.js`,
`bracket.js`, `backfillRoasts.js`, `settleMatches.js`, `tiebreaker.js`,
`sendReminders.js`, `seedMatches.js`, `recordSync.js`, `removeSeeded.js`,
`exportMatches.js`, `migrateBrackets.js`, `undoBackfillAutoPicks.js`.

Unchanged (not included; import targets only): `firebase.js`,
`roastTemplates.js`, `wc2026Venues.js`, `main.jsx`, data JSON, rules.
