import numpy as np

from app.core.yallop import classify_q, q_value


def test_q_polynomial_basic():
    arcv = np.array([5.0])
    w = np.array([1.0])  # arcmin
    q = q_value(arcv, w)[0]
    assert np.isfinite(q)


def test_classification_boundaries():
    qs = np.array([0.5, 0.1, -0.05, -0.2, -0.25, -0.5])
    cats = classify_q(qs)
    assert cats.tolist() == ["A", "B", "C", "D", "E", "F"]

