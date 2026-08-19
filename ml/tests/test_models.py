"""Unit tests for the metric/model core — run in CI on every PR."""
import numpy as np

import models as M


def test_feature_matrix_order():
    row = {k: i for i, k in enumerate(M.FEATURE_ORDER)}
    X = M.to_matrix([row])
    assert X.shape == (1, len(M.FEATURE_ORDER))
    assert list(X[0]) == list(range(len(M.FEATURE_ORDER)))


def test_match_probs_sum_to_one():
    p = M.match_probs(1.5, 1.1)
    assert abs(p["ph"] + p["pd"] + p["pa"] - 1.0) < 1e-6


def test_rps_perfect_beats_uniform():
    actual = np.array([0, 1, 2])
    perfect = np.eye(3)[actual]
    uniform = np.full((3, 3), 1 / 3)
    assert M.ranked_probability_score(perfect, actual) < \
        M.ranked_probability_score(uniform, actual)


def test_glm_learns_home_edge():
    # Synthetic: strong home teams score more. Model should rank lh > la.
    rng = np.random.default_rng(0)
    rows = []
    for _ in range(400):
        diff = rng.normal(200, 100)
        base = dict.fromkeys(M.FEATURE_ORDER, 0.0)
        base.update(home_rating=1600 + diff, away_rating=1600,
                    rating_diff=diff, g_home=1.45, g_away=1.15,
                    home_att=1, home_def=1, away_att=1, away_def=1)
        lam_h = 1.45 * np.exp(0.002 * diff)
        base["homeScore"] = rng.poisson(lam_h)
        base["awayScore"] = rng.poisson(1.15)
        base["kickoff"] = "2026-01-01"
        rows.append(base)
    split = M.time_split(rows, 0.2)
    model = M.GLMModel().fit(split.Xtr, split.yh_tr, split.ya_tr)
    lh, la = model.predict(split.Xte)
    assert lh.mean() > la.mean()
