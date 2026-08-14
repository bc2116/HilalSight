from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from math import asin
from typing import Any

import numpy as np
from skyfield.api import wgs84
from timezonefinder import TimezoneFinder
from zoneinfo import ZoneInfo

from .ephemeris import get_ephemeris, get_timescale
from .newmoon import conjunction_near_date
from .yallop import (
    SPECIAL_MOON_SET_BEFORE_SUN,
    SPECIAL_NO_MOONSET,
    SPECIAL_NO_SUNSET,
    SPECIAL_PRIOR_CONJUNCTION,
    classify_q,
    q_value,
    recommended_method,
)

MOON_RADIUS_KM = 1737.4


@dataclass(frozen=True)
class PointVisibility:
    category: str
    method: str
    q: float | None
    arcl_deg: float | None
    arcv_deg: float | None
    daz_deg: float | None
    w_arcmin: float | None
    age_hours: float | None
    lag_minutes: float | None
    moon_alt_sunset_deg: float | None
    moon_alt_best_deg: float | None
    sun_alt_best_deg: float | None
    ts_utc: datetime | None
    tm_utc: datetime | None
    tb_utc: datetime | None
    ts_local: str | None
    tm_local: str | None
    tb_local: str | None
    timezone: str | None


def _format_local(dt_utc: datetime, tzname: str) -> str:
    return dt_utc.astimezone(ZoneInfo(tzname)).isoformat()


def _find_first_setting_time_scalar(observer, body, ts, t_start, hours: float, step_minutes: int, horizon_deg: float) -> datetime | None:
    step_days = step_minutes / (24 * 60)
    n = int(hours * 60 / step_minutes) + 1
    prev_alt = None
    prev_t = None
    for i in range(n):
        t = t_start + i * step_days
        alt = observer.at(t).observe(body).apparent().altaz()[0].degrees
        above = alt > horizon_deg
        if prev_alt is not None and prev_alt and (not above):
            # Bisection refine
            lo = prev_t
            hi = t
            for _ in range(20):
                mid = ts.tt_jd((lo.tt + hi.tt) / 2)
                alt_mid = observer.at(mid).observe(body).apparent().altaz()[0].degrees
                if alt_mid > horizon_deg:
                    lo = mid
                else:
                    hi = mid
            return ts.tt_jd((lo.tt + hi.tt) / 2).utc_datetime().replace(tzinfo=timezone.utc)
        prev_alt = above
        prev_t = t
    return None


def compute_visibility_point(lat: float, lon: float, date_label: date, day_offset: int) -> PointVisibility:
    eph = get_ephemeris()
    ts = get_timescale()
    conj_dt = conjunction_near_date(date_label)
    conj_t = ts.utc(conj_dt)

    topos = wgs84.latlon(latitude_degrees=lat, longitude_degrees=lon)
    observer = eph["earth"] + topos

    # Interpret `date_label + day_offset` as a civil date label. Start searching
    # from "local noon" using local-mean-time offset ~ lon/15 hours so that Day N
    # corresponds to the same calendar-date evening across longitudes.
    local_date = date_label + timedelta(days=day_offset)
    base_dt = datetime(local_date.year, local_date.month, local_date.day, 12, tzinfo=timezone.utc)
    t0_dt = base_dt - timedelta(hours=(lon / 15.0))
    t0 = ts.utc(t0_dt)

    sun = eph["sun"]
    moon = eph["moon"]

    # Only accept a sunset in the requested local civil-day search window.
    # A 48-hour window incorrectly borrowed the following day's sunset in
    # high-latitude summer locations.
    ts_dt = _find_first_setting_time_scalar(observer, sun, ts, t0, hours=24, step_minutes=20, horizon_deg=0.0)
    if ts_dt is None:
        return PointVisibility(
            category=SPECIAL_NO_SUNSET,
            method="N/A",
            q=None,
            arcl_deg=None,
            arcv_deg=None,
            daz_deg=None,
            w_arcmin=None,
            age_hours=None,
            lag_minutes=None,
            moon_alt_sunset_deg=None,
            moon_alt_best_deg=None,
            sun_alt_best_deg=None,
            ts_utc=None,
            tm_utc=None,
            tb_utc=None,
            ts_local=None,
            tm_local=None,
            tb_local=None,
            timezone=None,
        )

    ts_t = ts.utc(ts_dt)
    moon_alt_ts = observer.at(ts_t).observe(moon).apparent().altaz()[0].degrees
    if moon_alt_ts <= 0.0:
        return PointVisibility(
            category=SPECIAL_MOON_SET_BEFORE_SUN,
            method="Not visible",
            q=None,
            arcl_deg=None,
            arcv_deg=None,
            daz_deg=None,
            w_arcmin=None,
            age_hours=None,
            lag_minutes=None,
            moon_alt_sunset_deg=float(moon_alt_ts),
            moon_alt_best_deg=None,
            sun_alt_best_deg=None,
            ts_utc=ts_dt,
            tm_utc=None,
            tb_utc=None,
            ts_local=None,
            tm_local=None,
            tb_local=None,
            timezone=None,
        )

    tm_dt = _find_first_setting_time_scalar(observer, moon, ts, ts_t, hours=24, step_minutes=20, horizon_deg=0.0)
    if tm_dt is None:
        return PointVisibility(
            category=SPECIAL_NO_MOONSET,
            method="N/A",
            q=None,
            arcl_deg=None,
            arcv_deg=None,
            daz_deg=None,
            w_arcmin=None,
            age_hours=None,
            lag_minutes=None,
            moon_alt_sunset_deg=float(moon_alt_ts),
            moon_alt_best_deg=None,
            sun_alt_best_deg=None,
            ts_utc=ts_dt,
            tm_utc=None,
            tb_utc=None,
            ts_local=None,
            tm_local=None,
            tb_local=None,
            timezone=None,
        )

    tm_t = ts.utc(tm_dt)
    lag_minutes = (tm_t.tt - ts_t.tt) * 24 * 60
    tb_t = ts.tt_jd(ts_t.tt + (4.0 / 9.0) * (tm_t.tt - ts_t.tt))
    tb_dt = tb_t.utc_datetime().replace(tzinfo=timezone.utc)

    if tb_t.tt < conj_t.tt:
        return PointVisibility(
            category=SPECIAL_PRIOR_CONJUNCTION,
            method="Not visible",
            q=None,
            arcl_deg=None,
            arcv_deg=None,
            daz_deg=None,
            w_arcmin=None,
            age_hours=float((tb_t.tt - conj_t.tt) * 24.0),
            lag_minutes=float(lag_minutes),
            moon_alt_sunset_deg=float(moon_alt_ts),
            moon_alt_best_deg=float(observer.at(tb_t).observe(moon).apparent().altaz()[0].degrees),
            sun_alt_best_deg=float(observer.at(tb_t).observe(sun).apparent().altaz()[0].degrees),
            ts_utc=ts_dt,
            tm_utc=tm_dt,
            tb_utc=tb_dt,
            ts_local=None,
            tm_local=None,
            tb_local=None,
            timezone=None,
        )

    # Compute variables at Tb
    sun_alt, sun_az, _ = observer.at(tb_t).observe(sun).apparent().altaz()
    moon_alt, moon_az, moon_dist = observer.at(tb_t).observe(moon).apparent().altaz()
    arcv = moon_alt.degrees - sun_alt.degrees
    daz = (sun_az.degrees - moon_az.degrees + 180.0) % 360.0 - 180.0

    # Geocentric elongation
    earth = eph["earth"]
    sun_geo = earth.at(tb_t).observe(sun).apparent()
    moon_geo = earth.at(tb_t).observe(moon).apparent()
    arcl = sun_geo.separation_from(moon_geo).degrees

    # Topocentric crescent width W' (arcminutes)
    dist_km = moon_dist.km
    sd_rad = asin(MOON_RADIUS_KM / dist_km)
    sd_arcmin = (sd_rad * 180.0 / np.pi) * 60.0
    w_arcmin = sd_arcmin * (1.0 - np.cos(np.deg2rad(arcl)))

    q = float(q_value(np.array([arcv]), np.array([w_arcmin]))[0])
    category = str(classify_q(np.array([q]))[0])

    age_hours = float((tb_t.tt - conj_t.tt) * 24.0)

    # Local time formatting (best-effort)
    tf = TimezoneFinder()
    tzname = tf.timezone_at(lat=lat, lng=lon) or "UTC"
    try:
        ts_local = _format_local(ts_dt, tzname)
        tm_local = _format_local(tm_dt, tzname)
        tb_local = _format_local(tb_dt, tzname)
    except Exception:
        tzname = "UTC"
        ts_local = ts_dt.isoformat()
        tm_local = tm_dt.isoformat()
        tb_local = tb_dt.isoformat()

    return PointVisibility(
        category=category,
        method=recommended_method(category),
        q=q,
        arcl_deg=float(arcl),
        arcv_deg=float(arcv),
        daz_deg=float(daz),
        w_arcmin=float(w_arcmin),
        age_hours=age_hours,
        lag_minutes=float(lag_minutes),
        moon_alt_sunset_deg=float(moon_alt_ts),
        moon_alt_best_deg=float(moon_alt.degrees),
        sun_alt_best_deg=float(sun_alt.degrees),
        ts_utc=ts_dt,
        tm_utc=tm_dt,
        tb_utc=tb_dt,
        ts_local=ts_local,
        tm_local=tm_local,
        tb_local=tb_local,
        timezone=tzname,
    )


def point_visibility_to_dict(p: PointVisibility) -> dict[str, Any]:
    def dt(v: datetime | None) -> str | None:
        return v.isoformat() if v else None

    return {
        "category": p.category,
        "method": p.method,
        "q": p.q,
        "arclDeg": p.arcl_deg,
        "arcvDeg": p.arcv_deg,
        "dazDeg": p.daz_deg,
        "wArcmin": p.w_arcmin,
        "ageHours": p.age_hours,
        "lagMinutes": p.lag_minutes,
        "moonAltSunsetDeg": p.moon_alt_sunset_deg,
        "moonAltBestDeg": p.moon_alt_best_deg,
        "sunAltBestDeg": p.sun_alt_best_deg,
        "tsUtc": dt(p.ts_utc),
        "tmUtc": dt(p.tm_utc),
        "tbUtc": dt(p.tb_utc),
        "tsLocal": p.ts_local,
        "tmLocal": p.tm_local,
        "tbLocal": p.tb_local,
        "timezone": p.timezone,
    }
