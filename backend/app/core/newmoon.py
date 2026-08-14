from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from skyfield import almanac

from .ephemeris import get_ephemeris, get_timescale


def next_new_moon(from_date: date) -> datetime:
    """Return the next astronomical new moon (conjunction) after from_date (UTC)."""
    eph = get_ephemeris()
    ts = get_timescale()

    t0 = ts.utc(from_date.year, from_date.month, from_date.day)
    t1 = ts.utc((from_date + timedelta(days=40)).year, (from_date + timedelta(days=40)).month, (from_date + timedelta(days=40)).day)

    f = almanac.moon_phases(eph)
    times, phases = almanac.find_discrete(t0, t1, f)
    for t, p in zip(times, phases):
        if int(p) == 0:  # new moon
            return t.utc_datetime().replace(tzinfo=timezone.utc)
    raise RuntimeError("No new moon found in search window")


def conjunction_near_date(d: date) -> datetime:
    """Find the new moon (UTC) that occurs near the provided UTC date label."""
    # Search from the day before so that if conjunction happens early on d, we still catch it.
    return next_new_moon(d - timedelta(days=1))

