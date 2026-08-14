from __future__ import annotations

import json
import math
import time
from http.client import HTTPException, HTTPSConnection
from threading import Lock
from typing import Any, Final
from urllib.parse import urlencode


NOMINATIM_HOST: Final[str] = "nominatim.openstreetmap.org"
NOMINATIM_PATH: Final[str] = "/search"
USER_AGENT: Final[str] = "HilalSight/0.1 (+https://github.com/bc2116/HilalSight)"
MAX_QUERY_LENGTH: Final[int] = 100
MAX_CACHE_ENTRIES: Final[int] = 256

_lock = Lock()
_last_request_started = 0.0
_cache: dict[str, list[dict[str, Any]]] = {}


class GeocodingError(RuntimeError):
    """A controlled upstream geocoding failure safe to expose to clients."""


def validate_query(query: str) -> str:
    if any(ord(character) < 32 or ord(character) == 127 for character in query):
        raise ValueError("q contains unsupported control characters")
    cleaned = " ".join(query.strip().split())
    if not cleaned or len(cleaned) > MAX_QUERY_LENGTH:
        raise ValueError(f"q must contain 1-{MAX_QUERY_LENGTH} characters")
    return cleaned


def _parse_results(payload: object) -> list[dict[str, Any]]:
    if not isinstance(payload, list):
        raise GeocodingError("Geocoding service returned an invalid response")

    results: list[dict[str, Any]] = []
    for item in payload[:1]:
        if not isinstance(item, dict):
            continue
        try:
            lat = float(item["lat"])
            lon = float(item["lon"])
        except (KeyError, TypeError, ValueError):
            continue
        display_name = item.get("display_name")
        if (
            not math.isfinite(lat)
            or not math.isfinite(lon)
            or not (-90 <= lat <= 90)
            or not (-180 <= lon <= 180)
            or not isinstance(display_name, str)
            or not display_name.strip()
        ):
            continue
        results.append({"lat": lat, "lon": lon, "displayName": display_name.strip()[:300]})
    return results


def search(query: str) -> list[dict[str, Any]]:
    """Search Nominatim through a bounded, cached, process-wide 1 req/s client."""

    global _last_request_started
    cleaned = validate_query(query)
    key = cleaned.casefold()

    # Keep the lock across throttling and I/O. FastAPI runs this synchronous
    # function in a worker thread, and serialization is required by the public
    # Nominatim usage policy.
    with _lock:
        cached = _cache.get(key)
        if cached is not None:
            return cached

        wait_seconds = 1.0 - (time.monotonic() - _last_request_started)
        if wait_seconds > 0:
            time.sleep(wait_seconds)
        _last_request_started = time.monotonic()

        path = f"{NOMINATIM_PATH}?{urlencode({'q': cleaned, 'format': 'jsonv2', 'limit': 1})}"
        connection = HTTPSConnection(NOMINATIM_HOST, timeout=5)
        try:
            connection.request("GET", path, headers={"Accept": "application/json", "User-Agent": USER_AGENT})
            response = connection.getresponse()
            if response.status != 200:
                raise GeocodingError("Geocoding service is temporarily unavailable")
            body = response.read(65_537)
            if len(body) > 65_536:
                raise GeocodingError("Geocoding service response was too large")
            payload = json.loads(body)
        except (HTTPException, OSError, json.JSONDecodeError) as exc:
            raise GeocodingError("Geocoding service is temporarily unavailable") from exc
        finally:
            connection.close()

        results = _parse_results(payload)
        if len(_cache) >= MAX_CACHE_ENTRIES:
            _cache.pop(next(iter(_cache)))
        _cache[key] = results
        return results
