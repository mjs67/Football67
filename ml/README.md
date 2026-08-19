# football67 — ML goal model (batch / cloudless setup)

A trained replacement for the hand-tuned `expectedGoals()` blend in
`scripts/syncMatches.js`. The model maps **pre-match features → two goal
expectations `(lh, la)`**; everything downstream (win/draw/win %, most-likely
score) is still derived by the same Poisson grid the app uses in
`src/poisson.js`, so the game's numbers stay consistent.

**No cloud account required.** Training exports the model as coefficients
(`ml/model.json`); `scripts/mlClient.js` runs inference in pure JS *inside your
existing sync job*. There's no API to host, no container to run, no GCP/AWS.
"Deploying" a new model = committing the new `model.json`, which the retrain
workflow does for you. Uses only what you already have: **GitHub + Firebase**.

```
football-data.org ─► exportTrainingData.js ─► training_data.json
                                                    │
                                              train.py ─► model.json (+ optional MLflow UI)
                                                    │            │ gate vs production.json
                                              git commit ◄───────┘  (promotion = deploy)
                                                    │
                              syncMatches.js reads model.json via mlClient.js (pure JS)
                                                    │
                                            monitor.py (realized RPS + drift)
```

## The six pieces

| # | What | Where |
|---|------|-------|
| 1 | Train a model | `train.py`, `models.py` (GLM served; LightGBM offline benchmark) |
| 2 | Track experiments | git-as-registry (`production.json`) + optional MLflow logging |
| 3 | Containerize | `Dockerfile` + `serve.py` — **optional** API path, exercised in CI |
| 4 | Deploy | export coefficients → commit `model.json` → served inline by the sync |
| 5 | CI/CD | `ml-ci.yml` (lint/test/docker) + `ml-retrain.yml` (retrain → gate → commit) |
| 6 | Monitoring | `monitor.py` (realized RPS + PSI drift) |

The GLM is served because pure-JS inference needs a linear model. LightGBM is
still trained and scored each run; if it beats the GLM by >0.005 RPS, `train.py`
prints a note — that's your cue to consider the optional Python-served API path
(`serve.py` + `Dockerfile`, both kept in the repo and tested by `ml-ci`).

## Quickstart (local, no cloud)

```bash
cd ml
pip install numpy scikit-learn          # + lightgbm to enable the benchmark

FOOTBALL_DATA_TOKEN=xxx COMPETITIONS=WC node ../scripts/exportTrainingData.js
python train.py --data ../scripts/training_data.json
# -> writes model.json + production.json; prints the promotion decision
```

That's the whole loop. `model.json` is what gets served.

## Wiring the app to the model

`scripts/mlClient.js` loads `ml/model.json` and predicts in JS, falling back to
`expectedGoals()` if the file is missing or malformed — so the sync never breaks.

In `syncMatches.js`, add the import:

```js
import { buildFeatures, predictGoals } from "./mlClient.js";
```

and replace the single line inside the `if (!finished) { … }` block:

```js
    fields.odds = expectedGoals(home, away);
```

with (note: `predictGoals` is synchronous — no `await`):

```js
    const feats = buildFeatures({
      home, away, neutral: NEUTRAL_VENUE,
      strengthOf: strength, ratingOf,
      homeForm: fields.homeForm, awayForm: fields.awayForm,
      h2h: fields.h2h, gHome, gAway,
    });
    fields.odds = predictGoals(feats) || expectedGoals(home, away);
```

`strength`, `ratingOf`, `gHome`, `gAway`, `NEUTRAL_VENUE` are all already
defined in `syncMatches.js`. The stored `odds` keeps the exact `{ lh, la, n }`
shape, so `poisson.js`, `MatchCard`, auto-picks and scoring are unaffected.

## CI/CD

- **`ml-ci.yml`** (every PR): ruff + unit tests, then builds the optional API
  image and smoke-tests `/health` — needs no secrets, so it passes immediately.
- **`ml-retrain.yml`** (weekly + manual): export data → train → gate against
  `production.json` → **commit** the promoted `model.json`. The gate only ships
  a model that beats the deployed one's holdout RPS by the configured margin, so
  an automated retrain can't quietly regress you. The commit is the deploy — your
  next sync picks up the new `model.json` from the repo.

Needs one secret: `FOOTBALL_DATA_TOKEN`. `MLFLOW_TRACKING_URI` and
`FIREBASE_SA_JSON` are optional (experiment UI / monitoring).

## Metrics

Primary is **RPS** (ranked probability score — the football forecasting
standard). Also logged: log-loss, Brier, goal MAE, and — mapped to your +5/+3
scoring — exact-scoreline rate, result rate, average points. Splits are always
**chronological** (`time_split`), never random.

## Put it on GitHub

```bash
git checkout -b ml-pipeline
cp -r football67-ml/ml ./ml
cp football67-ml/scripts/{exportTrainingData,mlClient}.js ./scripts/
cp football67-ml/.github/workflows/ml-*.yml ./.github/workflows/
git add ml scripts/exportTrainingData.js scripts/mlClient.js .github/workflows/ml-*.yml
git commit -m "Add batch ML goal model (train, gate, commit-deploy, monitoring)"
git push -u origin ml-pipeline
```

Then: make the `syncMatches.js` edit above, add the `FOOTBALL_DATA_TOKEN`
secret, open the PR (`ml-ci` runs on it), and trigger `ml-retrain` once via
"Run workflow" to produce and commit the first `model.json`.

## Optional: hosted API (only if LightGBM meaningfully wins)

`serve.py` + `Dockerfile` serve any model (incl. LightGBM) over HTTP. If you go
this route, deploy the container anywhere (Cloud Run, Fly, Render, a VPS) and
point `mlClient.js` at it instead of reading `model.json`. Not needed for the
batch setup above.
