"""FastAPI serving layer.

Loads the goal-expectancy model and returns the same {lh, la, probs} shape that
syncMatches.js writes to each match's `odds` field. The model comes from
(in priority order):
  1. MODEL_URI  — an MLflow registry URI, e.g. models:/football67-goals@Production
  2. MODEL_PATH — a local pickle baked into the image (default ml/model.pkl)

Endpoints:
  GET  /health           -> liveness + which model is loaded
  POST /predict          -> one fixture's features -> {lh, la, ph, pd, pa, top}
  POST /predict-fixtures -> batch (for the Node sync job)
  GET  /metrics          -> Prometheus (latency, request counts, errors)
"""
from __future__ import annotations

import os
import time

from fastapi import FastAPI
from pydantic import BaseModel as PydModel
from pydantic import Field

import models as M

app = FastAPI(title="football67 goal model", version="1.0.0")

_MODEL = None
_SOURCE = "none"


def _load():
    global _MODEL, _SOURCE
    uri = os.environ.get("MODEL_URI")
    if uri:
        # Our models are plain pickles logged as artifacts; load via the run.
        import mlflow
        import mlflow.pyfunc  # noqa: F401
        import mlflow.sklearn  # ensures flavor import
        local = mlflow.artifacts.download_artifacts(uri)
        path = local if local.endswith(".pkl") else os.path.join(local, "model.pkl")
        _MODEL, _SOURCE = M.BaseModel.load(path), uri
    else:
        path = os.environ.get("MODEL_PATH", "ml/model.pkl")
        _MODEL, _SOURCE = M.BaseModel.load(path), path


@app.on_event("startup")
def startup():
    _load()
    try:
        from prometheus_fastapi_instrumentator import Instrumentator
        Instrumentator().instrument(app).expose(app)  # -> GET /metrics
    except Exception:
        pass  # monitoring optional; service still serves predictions


class Features(PydModel):
    home_rating: float = Field(1600)
    away_rating: float = Field(1600)
    rating_diff: float = 0
    neutral: int = 0
    home_att: float = 1
    home_def: float = 1
    away_att: float = 1
    away_def: float = 1
    home_n: float = 0
    away_n: float = 0
    g_home: float = 1.45
    g_away: float = 1.15
    home_w: float = 0
    home_d: float = 0
    home_l: float = 0
    away_w: float = 0
    away_d: float = 0
    away_l: float = 0
    h2h_home: float = 0
    h2h_draw: float = 0
    h2h_away: float = 0


@app.get("/health")
def health():
    return {"status": "ok" if _MODEL else "no_model",
            "model_kind": getattr(_MODEL, "kind", None), "source": _SOURCE}


@app.post("/predict")
def predict(f: Features):
    return _MODEL.predict_one(f.model_dump())


@app.post("/predict-fixtures")
def predict_fixtures(fixtures: list[Features]):
    t0 = time.time()
    out = [_MODEL.predict_one(f.model_dump()) for f in fixtures]
    return {"count": len(out), "ms": round((time.time() - t0) * 1000, 1),
            "predictions": out}
