"""Core model + metric layer for football67.

The model's ONLY job is to map pre-match features -> two goal expectations
(lh, la). Everything downstream (win/draw/win %, most-likely score) is derived
from those two numbers by the same independent-Poisson grid the app uses in
src/poisson.js, so offline eval and the live game stay in agreement.

Two interchangeable models are provided:
  - "glm"      : two Poisson regressions (a *learned* version of the hand-tuned
                 blend in syncMatches.js). Few params, robust on small data.
  - "lightgbm" : two gradient-boosted Poisson regressors. More capacity.
"""
from __future__ import annotations

import math
import pickle
from dataclasses import dataclass

import numpy as np

# Single source of truth for the feature vector. scripts/exportTrainingData.js
# (training) and scripts/mlClient.js (serving) MUST emit these keys in any
# order; we re-order to FEATURE_ORDER here so both paths agree.
FEATURE_ORDER = [
    "home_rating", "away_rating", "rating_diff", "neutral",
    "home_att", "home_def", "away_att", "away_def",
    "home_n", "away_n", "g_home", "g_away",
    "home_w", "home_d", "home_l",
    "away_w", "away_d", "away_l",
    "h2h_home", "h2h_draw", "h2h_away",
]

MAX_GOALS = 8  # matches MAX_GOALS in src/poisson.js


def to_matrix(rows: list[dict]) -> np.ndarray:
    return np.array([[float(r[k]) for k in FEATURE_ORDER] for r in rows], dtype=float)


# ── Poisson grid (ported verbatim from src/poisson.js so numbers match) ──
def _poisson_pmf(k: int, lam: float) -> float:
    return math.exp(-lam) * lam**k / math.factorial(k)


def match_probs(lh: float, la: float) -> dict:
    ph = pd = pa = 0.0
    top = {"h": 0, "a": 0, "p": 0.0}
    for h in range(MAX_GOALS + 1):
        for a in range(MAX_GOALS + 1):
            p = _poisson_pmf(h, lh) * _poisson_pmf(a, la)
            if h > a:
                ph += p
            elif h == a:
                pd += p
            else:
                pa += p
            if p > top["p"]:
                top = {"h": h, "a": a, "p": p}
    # Renormalize the tiny mass lost to truncation at MAX_GOALS so the three
    # outcome probs sum to exactly 1 (the app reads `top` and doesn't need
    # this; the eval metrics do). Divergence from src/poisson.js is < 2e-6.
    z = ph + pd + pa
    return {"ph": ph / z, "pd": pd / z, "pa": pa / z, "top": top}


# ── Metrics ──────────────────────────────────────────────────────────────
def _result_class(hs: int, as_: int) -> int:
    return 0 if hs > as_ else (1 if hs == as_ else 2)  # H, D, A


def ranked_probability_score(probs: np.ndarray, actual: np.ndarray) -> float:
    """RPS for ordered 3-outcome (H,D,A). Lower is better. The standard
    football forecasting metric — rewards being *close* on ordered outcomes."""
    cum_p = np.cumsum(probs, axis=1)
    onehot = np.zeros_like(probs)
    onehot[np.arange(len(actual)), actual] = 1.0
    cum_a = np.cumsum(onehot, axis=1)
    return float(np.mean(np.sum((cum_p - cum_a) ** 2, axis=1) / (probs.shape[1] - 1)))


def log_loss(probs: np.ndarray, actual: np.ndarray) -> float:
    eps = 1e-15
    p = np.clip(probs[np.arange(len(actual)), actual], eps, 1)
    return float(-np.mean(np.log(p)))


def brier(probs: np.ndarray, actual: np.ndarray) -> float:
    onehot = np.zeros_like(probs)
    onehot[np.arange(len(actual)), actual] = 1.0
    return float(np.mean(np.sum((probs - onehot) ** 2, axis=1)))


def game_scoring_metrics(lhs, las, hs, as_) -> dict:
    """Mirror the app's +5 exact / +3 result scoring so offline eval maps to
    real leaderboard value. Uses each match's most-likely scoreline as the
    model's 'pick' — exactly what aiPredictionFor() shows in the app."""
    exact = result = 0
    for lh, la, h, a in zip(lhs, las, hs, as_):
        top = match_probs(lh, la)["top"]
        if top["h"] == h and top["a"] == a:
            exact += 1
        elif np.sign(top["h"] - top["a"]) == np.sign(h - a):
            result += 1
    n = len(hs)
    pts = 5 * exact + 3 * result
    return {"exact_rate": exact / n, "result_rate": (exact + result) / n,
            "avg_points": pts / n}


def evaluate(lhs, las, hs, as_) -> dict:
    lhs, las = np.asarray(lhs), np.asarray(las)
    hs, as_ = np.asarray(hs), np.asarray(as_)
    probs = np.array([[mp["ph"], mp["pd"], mp["pa"]]
                      for mp in (match_probs(lh, la) for lh, la in zip(lhs, las))])
    actual = np.array([_result_class(h, a) for h, a in zip(hs, as_)])
    out = {
        "rps": ranked_probability_score(probs, actual),
        "log_loss": log_loss(probs, actual),
        "brier": brier(probs, actual),
        "goal_mae": float(np.mean(np.abs(lhs - hs) + np.abs(las - as_)) / 2),
    }
    out.update(game_scoring_metrics(lhs, las, hs, as_))
    return out


# ── Models ───────────────────────────────────────────────────────────────
class BaseModel:
    kind = "base"

    def fit(self, X, yh, ya):
        raise NotImplementedError

    def predict(self, X) -> tuple[np.ndarray, np.ndarray]:
        raise NotImplementedError

    def save(self, path):
        with open(path, "wb") as f:
            pickle.dump(self, f)

    @staticmethod
    def load(path) -> BaseModel:
        with open(path, "rb") as f:
            return pickle.load(f)

    def predict_one(self, features: dict) -> dict:
        X = to_matrix([features])
        lh, la = self.predict(X)
        lh, la = float(np.clip(lh[0], 0.25, 3.6)), float(np.clip(la[0], 0.25, 3.6))
        mp = match_probs(lh, la)
        return {"lh": round(lh, 3), "la": round(la, 3),
                "ph": mp["ph"], "pd": mp["pd"], "pa": mp["pa"],
                "top": mp["top"]}


class GLMModel(BaseModel):
    kind = "glm"

    def __init__(self):
        from sklearn.linear_model import PoissonRegressor
        from sklearn.preprocessing import StandardScaler
        self._scaler = StandardScaler()
        self._home = PoissonRegressor(alpha=1e-3, max_iter=500)
        self._away = PoissonRegressor(alpha=1e-3, max_iter=500)

    def fit(self, X, yh, ya):
        Xs = self._scaler.fit_transform(X)
        self._home.fit(Xs, yh)
        self._away.fit(Xs, ya)
        return self

    def predict(self, X):
        Xs = self._scaler.transform(X)
        return self._home.predict(Xs), self._away.predict(Xs)

    def export_linear(self) -> dict:
        """Fold the StandardScaler into the Poisson coefficients so inference
        is exp(intercept + coef·x) directly on RAW features — no scaling step
        needed on the JS serving side. For each side:
            raw_coef_i  = coef_i / scale_i
            raw_intercept = intercept - Σ coef_i·mean_i/scale_i
        """
        mean, scale = self._scaler.mean_, self._scaler.scale_

        def fold(reg):
            raw_coef = (reg.coef_ / scale).tolist()
            raw_int = float(reg.intercept_ - (reg.coef_ * mean / scale).sum())
            return {"intercept": raw_int, "coef": raw_coef}

        return {
            "kind": "glm-linear",
            "feature_order": FEATURE_ORDER,
            "clamp": [0.25, 3.6],
            "home": fold(self._home),
            "away": fold(self._away),
        }


class LGBMModel(BaseModel):
    kind = "lightgbm"

    def __init__(self, **params):
        from lightgbm import LGBMRegressor
        p = dict(objective="poisson", n_estimators=300, learning_rate=0.03,
                 num_leaves=15, min_child_samples=20, subsample=0.8,
                 colsample_bytree=0.8, verbose=-1)
        p.update(params)
        self._home = LGBMRegressor(**p)
        self._away = LGBMRegressor(**p)

    def fit(self, X, yh, ya):
        self._home.fit(X, yh)
        self._away.fit(X, ya)
        return self

    def predict(self, X):
        return self._home.predict(X), self._away.predict(X)

    def feature_importance(self) -> dict:
        imp = (self._home.feature_importances_ + self._away.feature_importances_) / 2
        return dict(sorted(zip(FEATURE_ORDER, imp.tolist()),
                           key=lambda kv: -kv[1]))


MODELS = {"glm": GLMModel, "lightgbm": LGBMModel}


@dataclass
class Split:
    Xtr: np.ndarray
    yh_tr: np.ndarray
    ya_tr: np.ndarray
    Xte: np.ndarray
    yh_te: np.ndarray
    ya_te: np.ndarray
    hs_te: np.ndarray
    as_te: np.ndarray


def time_split(rows: list[dict], holdout_frac=0.2) -> Split:
    """Chronological split — NEVER random. Football is temporal; a random
    split leaks the future into the past and flatters every metric."""
    rows = sorted(rows, key=lambda r: r.get("kickoff") or "")
    cut = int(len(rows) * (1 - holdout_frac))
    tr, te = rows[:cut], rows[cut:]
    X = to_matrix(tr)
    Xte = to_matrix(te)
    yh = np.array([r["homeScore"] for r in tr], float)
    ya = np.array([r["awayScore"] for r in tr], float)
    return Split(
        X, yh, ya, Xte,
        np.array([r["homeScore"] for r in te], float),
        np.array([r["awayScore"] for r in te], float),
        np.array([r["homeScore"] for r in te], int),
        np.array([r["awayScore"] for r in te], int),
    )
