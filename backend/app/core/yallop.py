from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Literal

import numpy as np


class VisibilityCategory(str, Enum):
    A = "A"
    B = "B"
    C = "C"
    D = "D"
    E = "E"
    F = "F"


SPECIAL_MOON_SET_BEFORE_SUN: Literal["MOON_SET_BEFORE_SUN"] = "MOON_SET_BEFORE_SUN"
SPECIAL_PRIOR_CONJUNCTION: Literal["PRIOR_CONJUNCTION"] = "PRIOR_CONJUNCTION"
SPECIAL_NO_SUNSET: Literal["NO_SUNSET"] = "NO_SUNSET"
SPECIAL_NO_MOONSET: Literal["NO_MOONSET"] = "NO_MOONSET"


@dataclass(frozen=True)
class QResult:
    q: float
    category: VisibilityCategory


def q_value(arcv_deg: np.ndarray, w_arcmin: np.ndarray) -> np.ndarray:
    # Yallop (1997, HMNAO Technical Note 69) q-test polynomial.
    w = w_arcmin
    threshold = 11.8371 - 6.3226 * w + 0.7319 * (w**2) - 0.1018 * (w**3)
    return (arcv_deg - threshold) / 10.0


def classify_q(q: np.ndarray) -> np.ndarray:
    # Returns array of category letters A-F.
    out = np.full(q.shape, VisibilityCategory.F.value, dtype=object)
    out[q > -0.293] = VisibilityCategory.E.value
    out[q > -0.232] = VisibilityCategory.D.value
    out[q > -0.160] = VisibilityCategory.C.value
    out[q > -0.014] = VisibilityCategory.B.value
    out[q > +0.216] = VisibilityCategory.A.value
    return out


def recommended_method(category: str) -> str:
    if category in ("A", "B"):
        return "Naked eye"
    if category in ("C", "D"):
        return "Optical aid (binoculars/telescope), then possibly naked eye"
    return "Not visible"

