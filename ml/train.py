"""Train, evaluate, and (in batch mode) export a servable model + gate promotion.

Trains every model in MODELS, evaluates on a chronological holdout, and picks
the winner by RPS. The SERVED model is the linear GLM, exported to model.json so
mlClient.js can run inference in pure JS inside the existing sync job — no API,
no container, no cloud. LightGBM is still trained and scored as an offline
benchmark; if it beats the GLM we log the gap so you know whether the heavier
Python-served path is worth adding.

Promotion uses git as the registry: the gate compares the new GLM's holdout RPS
against ml/production.json (the currently-deployed model's recorded RPS). On
improvement it rewrites model.json + production.json; the retrain workflow then
commits them, and that commit IS the deploy.

MLflow logging is optional — it runs only if MLFLOW_TRACKING_URI is set, purely
for the experiment-browsing UI. The gate never depends on it.

Usage:
  python train.py --data ../scripts/training_data.json
"""
from __future__ import annotations

import argparse
import contextlib
import json
import os
from datetime import UTC, datetime

import models as M


def load_rows(path: str) -> list[dict]:
    with open(path) as f:
        rows = json.load(f)
    rows = [r for r in rows
            if r.get("homeScore") is not None and r.get("awayScore") is not None]
    if len(rows) < 30:
        raise SystemExit(f"Only {len(rows)} labelled rows — need >=30 to train.")
    return rows


@contextlib.contextmanager
def mlflow_run(name):
    """Log to MLflow if configured, else a no-op. Keeps train.py cloud-free
    by default while still supporting a tracking server when you want one."""
    uri = os.environ.get("MLFLOW_TRACKING_URI")
    if not uri:
        class _Noop:
            def log_param(self, *a, **k): ...
            def log_metric(self, *a, **k): ...
            def log_metrics(self, *a, **k): ...
            def log_artifact(self, *a, **k): ...
        yield _Noop()
        return
    import mlflow
    mlflow.set_tracking_uri(uri)
    mlflow.set_experiment("football67-goals")
    with mlflow.start_run(run_name=name):
        class _Live:
            log_param = staticmethod(mlflow.log_param)
            log_metric = staticmethod(mlflow.log_metric)
            log_metrics = staticmethod(mlflow.log_metrics)
            log_artifact = staticmethod(mlflow.log_artifact)
        yield _Live()


def current_production_rps(path: str) -> float | None:
    try:
        with open(path) as f:
            return json.load(f).get("rps")
    except (OSError, ValueError):
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="../scripts/training_data.json")
    ap.add_argument("--model-json", default="model.json")
    ap.add_argument("--pkl", default="model.pkl",
                    help="also dump a pickle (only needed for the optional API)")
    ap.add_argument("--production", default="production.json")
    ap.add_argument("--holdout", type=float, default=0.2)
    ap.add_argument("--min-improvement", type=float, default=0.002)
    args = ap.parse_args()

    rows = load_rows(args.data)
    split = M.time_split(rows, args.holdout)
    ordered = sorted(rows, key=lambda r: r.get("kickoff") or "")

    metrics_by_kind = {}
    with mlflow_run("train-all") as run:
        run.log_param("n_train", len(split.yh_tr))
        run.log_param("n_holdout", len(split.hs_te))
        for kind, cls in M.MODELS.items():
            try:
                model = cls().fit(split.Xtr, split.yh_tr, split.ya_tr)
            except ImportError:
                # Optional benchmark model not installed (e.g. lightgbm in the
                # lean batch setup). The served GLM has no extra deps, so skip.
                print(f"{kind:9s}  skipped (dependency not installed)")
                continue
            lh, la = model.predict(split.Xte)
            m = M.evaluate(lh, la, split.hs_te, split.as_te)
            metrics_by_kind[kind] = m
            run.log_metrics({f"{kind}_{k}": v for k, v in m.items()})
            print(f"{kind:9s}  RPS={m['rps']:.4f}  logloss={m['log_loss']:.4f}  "
                  f"exact={m['exact_rate']:.3f}  result={m['result_rate']:.3f}")

        glm_rps = metrics_by_kind["glm"]["rps"]
        if "lightgbm" in metrics_by_kind:
            gap = glm_rps - metrics_by_kind["lightgbm"]["rps"]
            run.log_metric("lgbm_rps_advantage", gap)
            if gap > 0.005:
                print(f"\nNOTE: LightGBM beats the served GLM by {gap:.4f} RPS — "
                      "consider the Python-served path (ml/README.md).")

        # Served model = GLM, refit on ALL rows, exported as coefficients.
        glm_full = M.GLMModel().fit(
            M.to_matrix(ordered),
            [r["homeScore"] for r in ordered],
            [r["awayScore"] for r in ordered],
        )
        payload = glm_full.export_linear()
        payload["metrics"] = metrics_by_kind["glm"]
        payload["trained_at"] = datetime.now(UTC).isoformat()
        payload["n_train"] = len(ordered)
        with open(args.model_json, "w") as f:
            json.dump(payload, f, indent=2)
        glm_full.save(args.pkl)  # optional API artifact
        run.log_artifact(args.model_json)
        print(f"\nExported served model -> {args.model_json}")

    # ── Git-as-registry promotion gate ──
    prev = current_production_rps(args.production)
    improved = prev is None or (prev - glm_rps) >= args.min_improvement
    if improved:
        with open(args.production, "w") as f:
            json.dump({"rps": glm_rps, "metrics": metrics_by_kind["glm"],
                       "trained_at": payload["trained_at"]}, f, indent=2)
        print(f"PROMOTE: RPS {glm_rps:.4f}"
              + (f" beats {prev:.4f}" if prev is not None else " (first model)"))
    else:
        print(f"HOLD: RPS {glm_rps:.4f} vs production {prev:.4f} "
              f"(need -{args.min_improvement}). model.json built but NOT committed "
              "by the workflow.")

    with open("promoted.flag", "w") as f:
        f.write("1" if improved else "0")
    with open("last_metrics.json", "w") as f:
        json.dump({"winner_served": "glm", **metrics_by_kind["glm"],
                   "promoted": improved}, f, indent=2)


if __name__ == "__main__":
    main()
