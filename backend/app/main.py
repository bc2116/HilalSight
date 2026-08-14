from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Final

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware

from .core.cache_warm import get_warm_status, start_warm_job
from .core.ephemeris import get_ephemeris_info
from .core.geocoding import GeocodingError, search as geocode_search, validate_query
from .core.hijri import HijriDate, gregorian_to_hijri_civil, hijri_civil_to_gregorian, hijri_today_utc
from .core.map_grid import COMPUTE_LOCK_TIMEOUT_SECONDS, MapComputationBusy, MapResult, compute_map_cached
from .core.newmoon import next_new_moon
from .core.visibility import compute_visibility_point, point_visibility_to_dict


app = FastAPI(title="HilalSight API", version="0.1.0")

SUPPORTED_DATE_MIN: Final[date] = date(1900, 1, 1)
SUPPORTED_DATE_MAX: Final[date] = date(2050, 12, 31)
TRUSTED_BROWSER_ORIGINS: Final[frozenset[str]] = frozenset(
    {"http://localhost:5173", "http://127.0.0.1:5173"}
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(TRUSTED_BROWSER_ORIGINS),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Accept", "Content-Type"],
)


@app.middleware("http")
async def private_query_cache_control(request: Request, call_next):
    response = await call_next(request)
    if request.url.path in {"/api/geocode/search", "/api/visibility/point"}:
        response.headers["Cache-Control"] = "no-store"
    return response


def _supported_date(value: str, parameter: str) -> date:
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid {parameter}=YYYY-MM-DD") from exc
    if parsed.isoformat() != value:
        raise HTTPException(status_code=400, detail=f"Invalid {parameter}=YYYY-MM-DD")
    if not (SUPPORTED_DATE_MIN <= parsed <= SUPPORTED_DATE_MAX):
        raise HTTPException(
            status_code=400,
            detail=f"{parameter} must be between {SUPPORTED_DATE_MIN.isoformat()} and {SUPPORTED_DATE_MAX.isoformat()}",
        )
    return parsed


def _require_trusted_origin(request: Request) -> None:
    # Requests from curl and other non-browser local clients usually omit
    # Origin. A browser must prove it came from the bundled local UI so an
    # unrelated website cannot trigger a costly cache-warm POST via CSRF.
    origin = request.headers.get("origin")
    if origin is not None and origin not in TRUSTED_BROWSER_ORIGINS:
        raise HTTPException(status_code=403, detail="Untrusted request origin")
    if request.headers.get("sec-fetch-site", "").lower() == "cross-site":
        raise HTTPException(status_code=403, detail="Untrusted request origin")


@app.get("/api/status")
def status() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "HilalSight",
        "utcNow": datetime.now(timezone.utc).isoformat(),
        "ephemeris": get_ephemeris_info().__dict__,
    }


@app.get("/api/hijri/today")
def hijri_today() -> dict[str, Any]:
    g, h, nxt = hijri_today_utc()
    return {
        "gregorianDateUtc": g.isoformat(),
        "hijri": {"year": h.year, "month": h.month, "day": h.day, "monthName": h.month_name},
        "nextHijriMonth": {"year": nxt.year, "month": nxt.month, "day": nxt.day, "monthName": nxt.month_name},
        "calendar": "Islamic Civil (tabular arithmetic)",
        "note": "Official month starts may differ by country/authority and actual sighting.",
    }


@app.get("/api/hijri/from-gregorian")
def hijri_from_gregorian(date_: str = Query(..., alias="date")) -> dict[str, Any]:
    d = _supported_date(date_, "date")
    h = gregorian_to_hijri_civil(d)
    return {"gregorianDate": d.isoformat(), "hijri": {"year": h.year, "month": h.month, "day": h.day, "monthName": h.month_name}}


@app.get("/api/hijri/to-gregorian")
def hijri_to_gregorian(year: int, month: int, day: int = 1) -> dict[str, Any]:
    if year < 1 or not (1 <= month <= 12) or not (1 <= day <= 30):
        raise HTTPException(status_code=400, detail="Invalid Hijri date")
    try:
        requested = HijriDate(year=year, month=month, day=day)
        g = hijri_civil_to_gregorian(requested)
    except (OverflowError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Invalid Hijri date") from exc
    if gregorian_to_hijri_civil(g) != requested:
        raise HTTPException(status_code=400, detail="Invalid Hijri date")
    if not (SUPPORTED_DATE_MIN <= g <= SUPPORTED_DATE_MAX):
        raise HTTPException(status_code=400, detail="Hijri date is outside the supported 1900-2050 range")
    return {"hijri": {"year": year, "month": month, "day": day}, "gregorianDate": g.isoformat(), "calendar": "Islamic Civil (tabular arithmetic)"}


@app.get("/api/newmoon/next")
def newmoon_next(from_: str = Query(..., alias="from")) -> dict[str, Any]:
    d = _supported_date(from_, "from")
    dt = next_new_moon(d)
    return {"from": d.isoformat(), "newMoonUtc": dt.isoformat(), "newMoonDateUtc": dt.date().isoformat()}


@app.get("/api/visibility/map")
def visibility_map(
    request: Request,
    date_: str = Query(..., alias="date"),
    dayOffset: int = 0,
    resolution: float = 2.0,
) -> MapResult:
    _require_trusted_origin(request)
    d = _supported_date(date_, "date")
    if dayOffset not in (0, 1, 2, 3):
        raise HTTPException(status_code=400, detail="dayOffset must be 0-3")
    if resolution not in (0.5, 1.0, 2.0, 5.0):
        raise HTTPException(status_code=400, detail="resolution must be one of 0.5, 1.0, 2.0, 5.0")
    try:
        return compute_map_cached(d, dayOffset, resolution)
    except MapComputationBusy as exc:
        raise HTTPException(
            status_code=503,
            detail="Another visibility map is being computed; retry shortly",
            headers={"Retry-After": str(int(COMPUTE_LOCK_TIMEOUT_SECONDS))},
        ) from exc


@app.get("/api/visibility/point")
def visibility_point(
    request: Request,
    lat: float,
    lon: float,
    date_: str = Query(..., alias="date"),
    dayOffset: int = 0,
) -> dict[str, Any]:
    _require_trusted_origin(request)
    d = _supported_date(date_, "date")
    if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
        raise HTTPException(status_code=400, detail="lat/lon out of range")
    if dayOffset not in (0, 1, 2, 3):
        raise HTTPException(status_code=400, detail="dayOffset must be 0-3")
    p = compute_visibility_point(lat=lat, lon=lon, date_label=d, day_offset=dayOffset)
    return {"lat": lat, "lon": lon, "date": d.isoformat(), "dayOffset": dayOffset, "result": point_visibility_to_dict(p)}


@app.get("/api/geocode/search")
def geocode(request: Request, q: str = Query(...)) -> dict[str, Any]:
    _require_trusted_origin(request)
    try:
        cleaned = validate_query(q)
        return {"results": geocode_search(cleaned)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except GeocodingError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/cache/warm")
def cache_warm(request: Request, monthsAhead: int = 6, evenings: int = 3, resolution: float = 2.0) -> dict[str, Any]:
    _require_trusted_origin(request)
    # Keep this bounded; warming high-res global grids for many months can take a long time.
    if monthsAhead not in (3, 6, 12):
        raise HTTPException(status_code=400, detail="monthsAhead must be one of 3, 6, 12")
    if evenings not in (1, 2, 3):
        raise HTTPException(status_code=400, detail="evenings must be 1-3")
    if resolution not in (2.0, 5.0):
        raise HTTPException(status_code=400, detail="resolution must be 2.0 or 5.0 for cache warming")
    job = start_warm_job(months_ahead=monthsAhead, evenings=evenings, resolution=resolution, from_date=date.today())
    return job.__dict__


@app.get("/api/cache/warm/status")
def cache_warm_status() -> dict[str, Any]:
    return get_warm_status()
