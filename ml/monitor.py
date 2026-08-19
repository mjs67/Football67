"""Post-matchday monitoring.

Two jobs, run after results land (weekly, or on the same trigger as retrain):

1. MODEL QUALITY (drift in accuracy): score the predictions we actually served
   against real results — realized RPS / Brier / exact% / result% — over a
   trailing window. A rising RPS is the signal to retrain. Reads the same
   finished-match export the app already produces (scripts/matchesExport.json:
   each row carries the served lh/la + the actual score).

2. DATA DRIFT: Population Stability Index between recent live features and the
   training feature distribution. High PSI means the world moved away from what
   the model was trained on (new competition, roster changes) — retrain even if
   quality hasn't visibly dipped yet.

Writes ml/monitor_report.json and logs everything to MLflow if configured.
"""
from __future__ import annotations

import argparse
import json
import os

import numpy as np

import models as M


def quality(served_path: str, window: int) -> dict:
    with open(served_path) as f:
        rows = [r for r in json.load(f)
                if r.get("lh") is not None and r.get("homeScore") is not None]
    rows = sorted(rows, key=lambda r: r.get("kickoff") or "")[-window:]
    if not rows:
        return {"n": 0}
    m = M.evaluate([r["lh"] for r in rows], [r["la"] for r in rows],
                   [r["homeScore"] for r in rows], [r["awayScore"] for r in rows])
    m["n"] = len(rows)
    return m


def _psi(expected: np.ndarray, actual: np.ndarray, bins=10) -> float:
    edges = np.quantile(expected, np.linspace(0, 1, bins + 1))
    edges[0], edges[-1] = -np.inf, np.inf
    e = np.histogram(expected, edges)[0] / max(len(expected), 1) + 1e-6
    a = np.histogram(actual, edges)[0] / max(len(actual), 1) + 1e-6
    return float(np.sum((a - e) * np.log(a / e)))


def drift(train_path: str, recent_path: str) -> dict:
    with open(train_path) as f:
        train = json.load(f)
    with open(recent_path) as f:
        recent = json.load(f)
    Xtr, Xre = M.to_matrix(train), M.to_matrix(recent)
    psi = {feat: _psi(Xtr[:, i], Xre[:, i])
           for i, feat in enumerate(M.FEATURE_ORDER)}
    worst = max(psi.values()) if psi else 0.0
    return {"psi_by_feature": psi, "max_psi": worst,
            # PSI > 0.25 is the conventional "significant shift" threshold.
            "drift_alert": worst > 0.25}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--served", default="scripts/matchesExport.json")
    ap.add_argument("--train", default="scripts/training_data.json")
    ap.add_argument("--recent")  # optional live-feature dump for drift
    ap.add_argument("--window", type=int, default=40)
    args = ap.parse_args()

    report = {"quality": quality(args.served, args.window)}
    if args.recent and os.path.exists(args.recent):
        report["drift"] = drift(args.train, args.recent)

    with open("ml/monitor_report.json", "w") as f:
        json.dump(report, f, indent=2)
    print(json.dumps(report, indent=2))

    if os.environ.get("MLFLOW_TRACKING_URI"):
        import mlflow
        mlflow.set_experiment("football67-monitoring")
        with mlflow.start_run(run_name="matchday-monitor"):
            if report["quality"].get("n"):
                mlflow.log_metrics({f"realized_{k}": v
                                    for k, v in report["quality"].items()})
            if "drift" in report:
                mlflow.log_metric("max_psi", report["drift"]["max_psi"])

    # Non-zero exit = retrain recommended (CI can branch on this).
    q = report["quality"]
    if q.get("n", 0) >= 20 and q.get("rps", 0) > 0.22:
        print("::warning::realized RPS above 0.22 — retrain recommended")
    if report.get("drift", {}).get("drift_alert"):
        print("::warning::feature drift detected (PSI > 0.25) — retrain recommended")


if __name__ == "__main__":
    main()
