from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def _month(year: int, month: int, name: str) -> dict[str, int | str]:
    return {"year": year, "month": month, "monthName": name}


def test_stable_safar_uses_the_upcoming_august_lunation():
    response = client.get("/api/hijri/context", params={"date": "2026-08-11"})

    assert response.status_code == 200
    body = response.json()
    assert body["referenceDate"] == "2026-08-11"
    assert body["mode"] == "stable"
    assert body["month"] == _month(1448, 2, "Safar")
    assert body["transition"] is None
    assert body["calendar"] == "Islamic Civil (tabular reference)"
    assert body["defaultProjection"]["targetMonth"] == _month(1448, 3, "Rabi al-Awwal")
    assert body["defaultProjection"]["dateLabel"] == "2026-08-12"
    assert body["defaultProjection"]["conjunctionUtc"].startswith("2026-08-12T")
    assert body["defaultProjection"]["conjunctionUtc"].endswith("Z")
    assert body["defaultProjection"]["relation"] == "upcoming"


@pytest.mark.parametrize(
    ("reference_date", "phase", "relation"),
    (
        ("2026-08-12", "before", "upcoming"),
        ("2026-08-13", "before", "recent"),
        ("2026-08-14", "before", "recent"),
        ("2026-08-15", "after", "recent"),
        ("2026-08-16", "after", "recent"),
        ("2026-08-17", "after", "recent"),
    ),
)
def test_six_day_transition_keeps_the_august_lunation(
    reference_date: str, phase: str, relation: str
):
    response = client.get("/api/hijri/context", params={"date": reference_date})

    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "transition"
    assert body["month"] is None
    assert body["transition"] == {
        "phase": phase,
        "leavingMonth": _month(1448, 2, "Safar"),
        "enteringMonth": _month(1448, 3, "Rabi al-Awwal"),
        "referenceBoundaryDate": "2026-08-15",
    }
    assert body["defaultProjection"]["targetMonth"] == _month(1448, 3, "Rabi al-Awwal")
    assert body["defaultProjection"]["dateLabel"] == "2026-08-12"
    assert body["defaultProjection"]["relation"] == relation


def test_stable_rabi_al_awwal_uses_the_upcoming_september_lunation():
    response = client.get("/api/hijri/context", params={"date": "2026-08-18"})

    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "stable"
    assert body["month"] == _month(1448, 3, "Rabi al-Awwal")
    assert body["transition"] is None
    assert body["defaultProjection"]["targetMonth"] == _month(1448, 4, "Rabi al-Thani")
    assert body["defaultProjection"]["dateLabel"] == "2026-09-11"
    assert body["defaultProjection"]["relation"] == "upcoming"


@pytest.mark.parametrize(
    "value",
    ("1899-12-31", "2051-01-01", "2026-8-12", "20260812", "2026-W33-3", "not-a-date"),
)
def test_context_rejects_unsupported_or_noncanonical_dates(value: str):
    response = client.get("/api/hijri/context", params={"date": value})

    assert response.status_code == 400


def test_context_rejects_a_missing_date_as_bad_request():
    response = client.get("/api/hijri/context")

    assert response.status_code == 400


@pytest.mark.parametrize("value", ("1900-01-01", "2050-12-31"))
def test_context_accepts_supported_range_endpoints(value: str):
    response = client.get("/api/hijri/context", params={"date": value})

    assert response.status_code == 200
    assert response.json()["referenceDate"] == value


@pytest.mark.parametrize(
    ("reference_date", "mode"),
    (("2026-06-13", "stable"), ("2026-06-14", "transition")),
)
def test_thirty_day_month_enters_transition_on_day_28(reference_date: str, mode: str):
    response = client.get("/api/hijri/context", params={"date": reference_date})

    assert response.status_code == 200
    assert response.json()["mode"] == mode


@pytest.mark.parametrize(
    ("reference_date", "expected_mode", "expected_projection_date"),
    (
        ("2050-12-18", "transition", "2050-12-14"),
        ("2050-12-19", "stable", None),
        ("2050-12-31", "stable", None),
    ),
)
def test_context_never_returns_an_out_of_range_projection(
    reference_date: str, expected_mode: str, expected_projection_date: str | None
):
    response = client.get("/api/hijri/context", params={"date": reference_date})

    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == expected_mode
    if expected_mode == "stable":
        assert body["month"] == _month(1473, 4, "Rabi al-Thani")
    else:
        assert body["transition"]["enteringMonth"] == _month(1473, 4, "Rabi al-Thani")

    projection = body["defaultProjection"]
    if expected_projection_date is None:
        assert projection is None
        return

    assert projection["dateLabel"] == expected_projection_date
    visibility_response = client.get(
        "/api/visibility/point",
        params={"lat": 0, "lon": 0, "date": projection["dateLabel"]},
    )
    assert visibility_response.status_code == 200


@pytest.mark.parametrize(
    ("reference_date", "phase"),
    (("2026-06-16", "before"), ("2026-06-17", "after")),
)
def test_transition_handles_hijri_year_rollover(reference_date: str, phase: str):
    response = client.get("/api/hijri/context", params={"date": reference_date})

    assert response.status_code == 200
    body = response.json()
    assert body["transition"] == {
        "phase": phase,
        "leavingMonth": _month(1447, 12, "Dhu al-Hijjah"),
        "enteringMonth": _month(1448, 1, "Muharram"),
        "referenceBoundaryDate": "2026-06-17",
    }
    assert body["defaultProjection"]["targetMonth"] == _month(1448, 1, "Muharram")
    assert body["defaultProjection"]["dateLabel"] == "2026-06-15"
