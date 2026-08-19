"""Smoke test the FastAPI app against a tiny trained model."""
import numpy as np
from fastapi.testclient import TestClient

import models as M


def _train_tiny(path):
    rng = np.random.default_rng(1)
    rows = []
    for _ in range(120):
        r = dict.fromkeys(M.FEATURE_ORDER, 0.0)
        r.update(home_rating=1700, away_rating=1600, rating_diff=160,
                 g_home=1.45, g_away=1.15, home_att=1, home_def=1,
                 away_att=1, away_def=1)
        rows.append(r)
    X = M.to_matrix(rows)
    yh = rng.poisson(1.8, len(rows)).astype(float)
    ya = rng.poisson(1.0, len(rows)).astype(float)
    M.GLMModel().fit(X, yh, ya).save(path)


def test_predict_endpoint(tmp_path, monkeypatch):
    model_path = tmp_path / "model.pkl"
    _train_tiny(str(model_path))
    monkeypatch.setenv("MODEL_PATH", str(model_path))
    import serve
    serve.startup()
    client = TestClient(serve.app)

    assert client.get("/health").json()["status"] == "ok"

    r = client.post("/predict", json={"home_rating": 1800, "away_rating": 1500,
                                      "rating_diff": 360})
    body = r.json()
    assert r.status_code == 200
    assert 0.25 <= body["lh"] <= 3.6
    assert abs(body["ph"] + body["pd"] + body["pa"] - 1.0) < 1e-6

    rb = client.post("/predict-fixtures", json=[{"home_rating": 1600},
                                                {"home_rating": 1700}])
    assert rb.json()["count"] == 2
