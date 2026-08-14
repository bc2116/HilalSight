from __future__ import annotations

import hashlib
import os
import tempfile
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta, timezone
from math import asin
from pathlib import Path
from threading import Lock
from typing import Any, Final

import numpy as np
import orjson
from skyfield.api import wgs84

from .ephemeris import BACKEND_DIR, get_ephemeris, get_ephemeris_info, get_timescale
from .newmoon import conjunction_near_date
from .yallop import (
    SPECIAL_MOON_SET_BEFORE_SUN,
    SPECIAL_NO_MOONSET,
    SPECIAL_NO_SUNSET,
    SPECIAL_PRIOR_CONJUNCTION,
    classify_q,
    q_value,
)

MOON_RADIUS_KM: Final[float] = 1737.4
CACHE_DIR: Final[Path] = BACKEND_DIR / ".cache"
_COMPUTE_LOCK = Lock()
MAX_CACHE_ENTRY_BYTES: Final[int] = 128 * 1024 * 1024
MAX_CACHE_TOTAL_BYTES: Final[int] = 512 * 1024 * 1024
MAX_CACHE_FILES: Final[int] = 256
COMPUTE_LOCK_TIMEOUT_SECONDS: Final[float] = 2.0


class MapComputationBusy(RuntimeError):
    """Raised when another expensive global map computation owns the worker."""


@dataclass(frozen=True)
class Marker:
    lat: float
    lon: float
    age_hours: float
    category: str


@dataclass(frozen=True)
class MapResult:
    date: str
    dayOffset: int
    resolution: float
    lat0: float
    lon0: float
    nLat: int
    nLon: int
    categories: list[str]
    ageHours: list[float | None]
    qValues: list[float | None]
    overlays: dict[str, list[bool]]
    markers: dict[str, Marker | None]
    conjunctionUtc: str
    ephemeris: dict[str, Any]


def _prune_map_cache(cache_dir: Path, protected: Path) -> None:
    entries: list[tuple[int, str, int, Path]] = []
    for path in cache_dir.glob("*.json"):
        try:
            metadata = path.stat()
        except OSError:
            continue
        entries.append((metadata.st_mtime_ns, path.name, metadata.st_size, path))

    entries.sort()
    total = sum(size for _, _, size, _ in entries)
    count = len(entries)
    for _, _, size, path in entries:
        if total <= MAX_CACHE_TOTAL_BYTES and count <= MAX_CACHE_FILES:
            break
        if path == protected:
            continue
        try:
            path.unlink()
        except FileNotFoundError:
            continue
        except OSError:
            continue
        total -= size
        count -= 1


def _safe_ts_tt_jd(ts, tt_jd: np.ndarray, fallback_tt: float):
    tt = np.where(np.isfinite(tt_jd), tt_jd, fallback_tt)
    return ts.tt_jd(tt)


def _observer_for_indices(earth, lat_degrees: np.ndarray, lon_degrees: np.ndarray, indices: np.ndarray):
    topos = wgs84.latlon(
        latitude_degrees=lat_degrees[indices],
        longitude_degrees=lon_degrees[indices],
    )
    return earth + topos


def _sunset_tt_for_points(
    earth,
    lat_degrees: np.ndarray,
    lon_degrees: np.ndarray,
    sun,
    ts,
    t0_tt: np.ndarray,
    horizon_deg: float = 0.0,
) -> tuple[np.ndarray, np.ndarray]:
    """Vector sunset for each point.

    Finds the first sunset after a per-point start time `t0_tt` (TT Julian day)
    within 24h. We use per-point start times so that "Day N" corresponds to the
    same *local* civil date evening across longitudes (critical for US east/west
    consistency).
    """
    n_points = len(t0_tt)
    found = np.zeros(n_points, dtype=bool)
    lower = np.full(n_points, np.nan)
    upper = np.full(n_points, np.nan)

    step_minutes = 30
    step_days = step_minutes / (24 * 60)
    steps = int(24 * 60 / step_minutes) + 1

    prev_above = np.zeros(n_points, dtype=bool)
    prev_tt = np.full(n_points, np.nan)
    unresolved = np.arange(n_points)
    for i in range(steps):
        if not unresolved.size:
            break

        tt = t0_tt[unresolved] + i * step_days
        observer = _observer_for_indices(earth, lat_degrees, lon_degrees, unresolved)
        alt = observer.at(ts.tt_jd(tt)).observe(sun).apparent().altaz()[0].degrees
        above = alt > horizon_deg

        crossed = prev_above[unresolved] & (~above) if i else np.zeros(unresolved.size, dtype=bool)
        crossed_indices = unresolved[crossed]
        lower[crossed_indices] = prev_tt[crossed_indices]
        upper[crossed_indices] = tt[crossed]
        found[crossed_indices] = True

        prev_above[unresolved] = above
        prev_tt[unresolved] = tt
        unresolved = unresolved[~crossed]

    # Refine only bracketed points; unresolved polar cells never enter bisection.
    found_indices = np.flatnonzero(found)
    if found_indices.size:
        lower_found = lower[found_indices].copy()
        upper_found = upper[found_indices].copy()
        observer = _observer_for_indices(earth, lat_degrees, lon_degrees, found_indices)
        for _ in range(18):
            mid = (lower_found + upper_found) / 2.0
            alt_mid = observer.at(ts.tt_jd(mid)).observe(sun).apparent().altaz()[0].degrees
            above_mid = alt_mid > horizon_deg
            lower_found = np.where(above_mid, mid, lower_found)
            upper_found = np.where(~above_mid, mid, upper_found)

        lower[found_indices] = lower_found
        upper[found_indices] = upper_found

    ts_tt = np.full(n_points, np.nan)
    ts_tt[found_indices] = (lower[found_indices] + upper[found_indices]) / 2.0
    return ts_tt, found


def _moonset_tt_after_sunset(
    earth,
    lat_degrees: np.ndarray,
    lon_degrees: np.ndarray,
    moon,
    ts,
    ts_tt: np.ndarray,
    has_sunset: np.ndarray,
    horizon_deg: float = 0.0,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Find first moon setting after Ts for each point (within 24h), vectorized."""
    n_points = len(ts_tt)

    moon_alt_ts = np.full(n_points, np.nan)
    sunset_indices = np.flatnonzero(has_sunset)
    if sunset_indices.size:
        observer = _observer_for_indices(earth, lat_degrees, lon_degrees, sunset_indices)
        moon_alt_ts[sunset_indices] = (
            observer.at(ts.tt_jd(ts_tt[sunset_indices])).observe(moon).apparent().altaz()[0].degrees
        )

    moon_before_sun = has_sunset & (moon_alt_ts <= horizon_deg)

    eligible = has_sunset & (~moon_before_sun)
    found = np.zeros(n_points, dtype=bool)
    lower = np.full(n_points, np.nan)
    upper = np.full(n_points, np.nan)

    # Scan at exact 20-minute increments up to 24h after Ts. Hourly sampling can
    # entirely miss a grazing moonset at high latitudes.
    step_minutes = 20
    steps = int(24 * 60 / step_minutes)
    above_prev = np.zeros(n_points, dtype=bool)
    above_prev[eligible] = moon_alt_ts[eligible] > horizon_deg
    prev_tt = np.full(n_points, np.nan)
    prev_tt[eligible] = ts_tt[eligible]
    unresolved = np.flatnonzero(eligible)

    for k in range(1, steps + 1):
        if not unresolved.size:
            break

        step_days = (k * step_minutes) / (24.0 * 60.0)
        tt_k = ts_tt[unresolved] + step_days
        observer = _observer_for_indices(earth, lat_degrees, lon_degrees, unresolved)
        alt_k = observer.at(ts.tt_jd(tt_k)).observe(moon).apparent().altaz()[0].degrees
        above_k = alt_k > horizon_deg

        crossed = above_prev[unresolved] & (~above_k)
        crossed_indices = unresolved[crossed]
        lower[crossed_indices] = prev_tt[crossed_indices]
        upper[crossed_indices] = tt_k[crossed]
        found[crossed_indices] = True

        above_prev[unresolved] = above_k
        prev_tt[unresolved] = tt_k
        unresolved = unresolved[~crossed]

    # Refine only points with a 20-minute setting bracket.
    found_indices = np.flatnonzero(found)
    if found_indices.size:
        lower_found = lower[found_indices].copy()
        upper_found = upper[found_indices].copy()
        observer = _observer_for_indices(earth, lat_degrees, lon_degrees, found_indices)
        for _ in range(18):
            mid = (lower_found + upper_found) / 2.0
            alt_mid = observer.at(ts.tt_jd(mid)).observe(moon).apparent().altaz()[0].degrees
            above_mid = alt_mid > horizon_deg
            lower_found = np.where(above_mid, mid, lower_found)
            upper_found = np.where(~above_mid, mid, upper_found)

        lower[found_indices] = lower_found
        upper[found_indices] = upper_found

    tm_tt = np.full(n_points, np.nan)
    tm_tt[found_indices] = (lower[found_indices] + upper[found_indices]) / 2.0
    no_moonset = eligible & (~found)
    return tm_tt, moon_before_sun, no_moonset


def _compute_markers(lat_grid: np.ndarray, lon_grid: np.ndarray, categories: np.ndarray, age_hours: np.ndarray) -> dict[str, Marker | None]:
    # First naked-eye: B or better (A,B). First optical aid: D or better (A-D).
    def _pick(allowed: set[str]) -> Marker | None:
        mask = np.isfinite(age_hours) & np.isin(categories, list(allowed))
        if not np.any(mask):
            return None
        idx = int(np.nanargmin(np.where(mask, age_hours, np.nan)))
        return Marker(lat=float(lat_grid[idx]), lon=float(lon_grid[idx]), age_hours=float(age_hours[idx]), category=str(categories[idx]))

    return {
        "firstNakedEye": _pick({"A", "B"}),
        "firstOpticalAid": _pick({"A", "B", "C", "D"}),
    }


def compute_map(date_label: date, day_offset: int, resolution: float) -> MapResult:
    eph = get_ephemeris()
    ts = get_timescale()
    eph_info = get_ephemeris_info()

    conj_dt = conjunction_near_date(date_label)
    conj_t = ts.utc(conj_dt)
    conj_tt = conj_t.tt

    # Grid centers (avoid poles).
    lon0 = -180.0 + resolution / 2.0
    lat0 = 90.0 - resolution / 2.0
    n_lon = int(360.0 / resolution)
    n_lat = int(180.0 / resolution)

    lons = lon0 + np.arange(n_lon) * resolution
    lats = lat0 - np.arange(n_lat) * resolution
    lon_grid, lat_grid = np.meshgrid(lons, lats)
    lat_flat = lat_grid.ravel()
    lon_flat = lon_grid.ravel()

    earth = eph["earth"]

    # Interpret `date_label + day_offset` as a *civil date label* for each location.
    # To pick the sunset for that local date consistently across longitudes, start
    # the sunset search at "local noon" using local-mean-time offset ~ lon/15 hours.
    local_date = date_label + timedelta(days=day_offset)
    t_base = ts.utc(datetime(local_date.year, local_date.month, local_date.day, 12, tzinfo=timezone.utc))
    offset_hours = lon_flat / 15.0
    t0_tt = t_base.tt - (offset_hours / 24.0)

    sun = eph["sun"]
    moon = eph["moon"]

    ts_tt, has_sunset = _sunset_tt_for_points(
        earth,
        lat_flat,
        lon_flat,
        sun,
        ts,
        t0_tt,
        horizon_deg=0.0,
    )
    tm_tt, moon_before_sun, no_moonset = _moonset_tt_after_sunset(
        earth,
        lat_flat,
        lon_flat,
        moon,
        ts,
        ts_tt,
        has_sunset,
        horizon_deg=0.0,
    )

    # Best time
    lag_days = tm_tt - ts_tt
    tb_tt = ts_tt + (4.0 / 9.0) * lag_days

    prior_conj = has_sunset & (~moon_before_sun) & np.isfinite(tb_tt) & (tb_tt < conj_tt)

    age_hours = (tb_tt - conj_tt) * 24.0

    # Compute at Tb for valid points
    valid = has_sunset & (~moon_before_sun) & (~no_moonset) & (~prior_conj) & np.isfinite(tb_tt)
    t_fallback = float(t_base.tt)
    tb_t = _safe_ts_tt_jd(ts, np.where(valid, tb_tt, np.nan), t_fallback)

    # Topocentric alt/az at Tb
    observer = _observer_for_indices(earth, lat_flat, lon_flat, np.arange(lat_flat.size))
    sun_alt, sun_az, _ = observer.at(tb_t).observe(sun).apparent().altaz()
    moon_alt, moon_az, moon_dist = observer.at(tb_t).observe(moon).apparent().altaz()

    arcv = moon_alt.degrees - sun_alt.degrees
    daz = (sun_az.degrees - moon_az.degrees + 180.0) % 360.0 - 180.0

    sun_geo = earth.at(tb_t).observe(sun).apparent()
    moon_geo = earth.at(tb_t).observe(moon).apparent()
    arcl = sun_geo.separation_from(moon_geo).degrees

    # W' arcmin
    dist_km = moon_dist.km
    sd_rad = np.arcsin(MOON_RADIUS_KM / dist_km)
    sd_arcmin = (sd_rad * 180.0 / np.pi) * 60.0
    w_arcmin = sd_arcmin * (1.0 - np.cos(np.deg2rad(arcl)))

    q = q_value(arcv, w_arcmin)
    cat = classify_q(q)

    # Overwrite specials
    categories = cat.astype(object)
    categories[~has_sunset] = SPECIAL_NO_SUNSET
    categories[moon_before_sun] = SPECIAL_MOON_SET_BEFORE_SUN
    categories[no_moonset] = SPECIAL_NO_MOONSET
    categories[prior_conj] = SPECIAL_PRIOR_CONJUNCTION

    # Age hours only meaningful when computed after conjunction and valid
    age_out = np.where(valid, age_hours, np.nan)
    q_out = np.where(valid, q, np.nan)

    markers = _compute_markers(lat_flat, lon_flat, categories, age_out)

    # Convert arrays to JSON-friendly lists (flattened row-major [lat-major, lon-minor])
    age_list: list[float | None] = [None if not np.isfinite(v) else float(v) for v in age_out.tolist()]
    q_list: list[float | None] = [None if not np.isfinite(v) else float(v) for v in q_out.tolist()]
    cat_list = [str(x) for x in categories.tolist()]
    overlays = {
        "moonSetsBeforeSun": moon_before_sun.tolist(),
        "priorConjunction": prior_conj.tolist(),
        "noSunset": (~has_sunset).tolist(),
        "noMoonset": no_moonset.tolist(),
    }

    return MapResult(
        date=date_label.isoformat(),
        dayOffset=day_offset,
        resolution=resolution,
        lat0=float(lat0),
        lon0=float(lon0),
        nLat=int(n_lat),
        nLon=int(n_lon),
        categories=cat_list,
        ageHours=age_list,
        qValues=q_list,
        overlays=overlays,
        markers={k: v for k, v in markers.items()},
        conjunctionUtc=conj_dt.isoformat(),
        ephemeris=asdict(eph_info),
    )


def compute_map_cached(date_label: date, day_offset: int, resolution: float) -> MapResult:
    eph_info = get_ephemeris_info()
    # Bump when map semantics change (e.g., sunset selection logic).
    cache_version = "v4-civil-date-20m-moonset"
    key = ("map", cache_version, date_label.isoformat(), int(day_offset), float(resolution), eph_info.file, eph_info.sha256)
    map_cache_dir = CACHE_DIR / "maps"
    digest = hashlib.sha256(orjson.dumps(key)).hexdigest()
    cache_path = map_cache_dir / f"{digest}.json"

    def load_cached() -> MapResult | None:
        try:
            if cache_path.stat().st_size > MAX_CACHE_ENTRY_BYTES:
                return None
            payload = orjson.loads(cache_path.read_bytes())
            if not isinstance(payload, dict):
                return None
            result = MapResult(**payload)
            try:
                os.utime(cache_path, None)
            except OSError:
                pass
            return result
        except (FileNotFoundError, OSError, orjson.JSONDecodeError, TypeError):
            return None

    cached = load_cached()
    if cached is not None:
        return cached

    # Avoid multiplying the already substantial CPU and memory cost when the
    # UI requests several evenings at once. Re-check after taking the lock in
    # case another request populated this key while we waited.
    if not _COMPUTE_LOCK.acquire(timeout=COMPUTE_LOCK_TIMEOUT_SECONDS):
        raise MapComputationBusy("Another visibility map is still being computed")
    try:
        cached = load_cached()
        if cached is not None:
            return cached
        res = compute_map(date_label, day_offset, resolution)
        map_cache_dir.mkdir(parents=True, exist_ok=True)
        encoded = orjson.dumps(asdict(res))
        if len(encoded) <= MAX_CACHE_ENTRY_BYTES:
            descriptor, temporary_name = tempfile.mkstemp(prefix=f".{digest}.", suffix=".tmp", dir=map_cache_dir)
            try:
                with os.fdopen(descriptor, "wb") as temporary:
                    temporary.write(encoded)
                    temporary.flush()
                    os.fsync(temporary.fileno())
                os.replace(temporary_name, cache_path)
            finally:
                try:
                    os.unlink(temporary_name)
                except FileNotFoundError:
                    pass
            _prune_map_cache(map_cache_dir, cache_path)
        return res
    finally:
        _COMPUTE_LOCK.release()
