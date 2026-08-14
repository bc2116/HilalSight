from datetime import date
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.core.ephemeris import DEFAULT_EPHEMERIS_SHA256
from app.core import geocoding
from app.core import map_grid
from app.core.geocoding import validate_query
from app.core.visibility import compute_visibility_point
from app.core.yallop import SPECIAL_NO_SUNSET
from app.main import app


client = TestClient(app)


def test_status_exposes_verified_ephemeris_without_server_path():
    response = client.get("/api/status")
    assert response.status_code == 200
    ephemeris = response.json()["ephemeris"]
    assert ephemeris["sha256"] == DEFAULT_EPHEMERIS_SHA256
    assert "path" not in ephemeris


def test_visibility_point_rejects_invalid_offset_and_unsupported_dates():
    params = {"lat": 21.4225, "lon": 39.8262, "date": "2026-07-14"}
    accepted = client.get("/api/visibility/point", params=params)
    assert accepted.status_code == 200
    assert accepted.headers["cache-control"] == "no-store"
    rejected = client.get("/api/visibility/point", params={**params, "dayOffset": -1})
    assert rejected.status_code == 400
    assert rejected.headers["cache-control"] == "no-store"
    assert client.get("/api/visibility/point", params={**params, "dayOffset": 4}).status_code == 400
    assert client.get("/api/visibility/point", params={**params, "date": "1899-12-31"}).status_code == 400
    assert client.get("/api/visibility/point", params={**params, "date": "2051-01-01"}).status_code == 400
    assert client.get("/api/visibility/point", params={**params, "date": "20260714"}).status_code == 400
    assert client.get("/api/visibility/point", params={**params, "date": "2026-W29-2"}).status_code == 400


def test_hijri_conversion_rejects_normalized_invalid_month_days():
    invalid = client.get("/api/hijri/to-gregorian", params={"year": 1448, "month": 2, "day": 30})
    assert invalid.status_code == 400
    valid = client.get("/api/hijri/to-gregorian", params={"year": 1448, "month": 1, "day": 30})
    assert valid.status_code == 200


def test_cache_warm_rejects_cross_site_browser_origin():
    response = client.post("/api/cache/warm", headers={"Origin": "https://example.invalid"})
    assert response.status_code == 403


def test_expensive_gets_reject_cross_site_browser_triggers():
    requests = (
        ("/api/visibility/map", {"date": "2026-07-14", "dayOffset": 0, "resolution": 5}),
        ("/api/visibility/point", {"lat": 21.4225, "lon": 39.8262, "date": "2026-07-14"}),
        ("/api/geocode/search", {"q": "Makkah"}),
    )
    for path, params in requests:
        response = client.get(path, params=params, headers={"Sec-Fetch-Site": "cross-site"})
        assert response.status_code == 403


def test_geocode_query_validation_is_bounded_without_network_access():
    assert validate_query("  Makkah   Saudi Arabia  ") == "Makkah Saudi Arabia"
    for value in ("", "x" * 101, "Makkah\nSaudi Arabia"):
        response = client.get("/api/geocode/search", params={"q": value})
        assert response.status_code == 400
        assert response.headers["cache-control"] == "no-store"


def test_geocode_proxy_returns_only_validated_minimal_fields(monkeypatch):
    class FakeResponse:
        status = 200

        @staticmethod
        def read(_limit):
            return b'[{"lat":"21.4225","lon":"39.8262","display_name":"Makkah","ignored":"value"}]'

    class FakeConnection:
        def __init__(self, host, timeout):
            assert host == geocoding.NOMINATIM_HOST
            assert timeout == 5

        def request(self, method, path, headers):
            assert method == "GET"
            assert path.startswith("/search?")
            assert headers["User-Agent"].startswith("HilalSight/")

        @staticmethod
        def getresponse():
            return FakeResponse()

        @staticmethod
        def close():
            pass

    monkeypatch.setattr(geocoding, "HTTPSConnection", FakeConnection)
    response = client.get("/api/geocode/search", params={"q": "Makkah test fixture"})
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {"results": [{"lat": 21.4225, "lon": 39.8262, "displayName": "Makkah"}]}


def test_polar_day_does_not_borrow_the_following_days_sunset():
    result = compute_visibility_point(69.6492, 18.9553, date(2026, 7, 20), 0)
    assert result.category == SPECIAL_NO_SUNSET


def test_map_cache_uses_safe_json_and_reuses_the_result(monkeypatch, tmp_path):
    calls = 0
    result = map_grid.MapResult(
        date="2026-07-14",
        dayOffset=0,
        resolution=5.0,
        lat0=87.5,
        lon0=-177.5,
        nLat=1,
        nLon=1,
        categories=["F"],
        ageHours=[1.0],
        qValues=[-0.5],
        overlays={"moonSetsBeforeSun": [False], "priorConjunction": [False], "noSunset": [False], "noMoonset": [False]},
        markers={"firstNakedEye": None, "firstOpticalAid": None},
        conjunctionUtc="2026-07-14T00:00:00+00:00",
        ephemeris={"file": "de421.bsp", "sha256": "fixture"},
    )

    def fake_compute(*_args):
        nonlocal calls
        calls += 1
        return result

    monkeypatch.setattr(map_grid, "CACHE_DIR", tmp_path)
    monkeypatch.setattr(map_grid, "MAX_CACHE_FILES", 1)
    monkeypatch.setattr(map_grid, "compute_map", fake_compute)
    monkeypatch.setattr(
        map_grid,
        "get_ephemeris_info",
        lambda: SimpleNamespace(file="de421.bsp", sha256="fixture"),
    )

    first = map_grid.compute_map_cached(date(2026, 7, 14), 0, 5.0)
    second = map_grid.compute_map_cached(date(2026, 7, 14), 0, 5.0)
    third = map_grid.compute_map_cached(date(2026, 7, 15), 0, 5.0)
    assert first == second
    assert third == first
    assert calls == 2
    assert len(list((tmp_path / "maps").glob("*.json"))) == 1


def test_map_cache_fails_fast_when_compute_slot_is_busy(monkeypatch, tmp_path):
    class BusyLock:
        @staticmethod
        def acquire(*, timeout):
            assert timeout == map_grid.COMPUTE_LOCK_TIMEOUT_SECONDS
            return False

    monkeypatch.setattr(map_grid, "CACHE_DIR", tmp_path)
    monkeypatch.setattr(map_grid, "_COMPUTE_LOCK", BusyLock())
    monkeypatch.setattr(
        map_grid,
        "get_ephemeris_info",
        lambda: SimpleNamespace(file="de421.bsp", sha256="fixture"),
    )

    with pytest.raises(map_grid.MapComputationBusy):
        map_grid.compute_map_cached(date(2026, 7, 14), 0, 5.0)
