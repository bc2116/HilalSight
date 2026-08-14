from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from math import ceil, floor


# Islamic Civil (tabular) calendar conversion.
# Deterministic and arithmetic; official starts can differ due to observation/local authority.

ISLAMIC_EPOCH = 1948439.5  # Julian Day of 1 Muharram 1 AH (Thursday, July 16, 622 Julian)

HIJRI_MONTH_NAMES = [
    "Muharram",
    "Safar",
    "Rabi al-Awwal",
    "Rabi al-Thani",
    "Jumada al-Awwal",
    "Jumada al-Thani",
    "Rajab",
    "Sha'ban",
    "Ramadan",
    "Shawwal",
    "Dhu al-Qi'dah",
    "Dhu al-Hijjah",
]


@dataclass(frozen=True)
class HijriDate:
    year: int
    month: int  # 1-12
    day: int  # 1-30

    @property
    def month_name(self) -> str:
        return HIJRI_MONTH_NAMES[self.month - 1]


def _gregorian_to_jd(d: date) -> float:
    # Fliegel–Van Flandern algorithm (Gregorian calendar).
    y = d.year
    m = d.month
    day = d.day
    a = (14 - m) // 12
    y2 = y + 4800 - a
    m2 = m + 12 * a - 3
    jd = day + (153 * m2 + 2) // 5 + 365 * y2 + y2 // 4 - y2 // 100 + y2 // 400 - 32045
    return float(jd) - 0.5  # start of day in JD


def _jd_to_gregorian(jd: float) -> date:
    # Convert Julian Day (starting at midnight) to Gregorian date.
    # We use the Julian Day Number (integer) at midnight UTC.
    jdn = int(floor(jd + 0.5))
    a = jdn + 32044
    b = (4 * a + 3) // 146097
    c = a - (146097 * b) // 4
    d = (4 * c + 3) // 1461
    e = c - (1461 * d) // 4
    m = (5 * e + 2) // 153
    day = e - (153 * m + 2) // 5 + 1
    month = m + 3 - 12 * (m // 10)
    year = 100 * b + d - 4800 + (m // 10)
    return date(int(year), int(month), int(day))


def _islamic_to_jd(year: int, month: int, day: int) -> float:
    return (
        day
        + ceil(29.5 * (month - 1))
        + (year - 1) * 354
        + floor((3 + 11 * year) / 30)
        + ISLAMIC_EPOCH
        - 1
    )


def gregorian_to_hijri_civil(d: date) -> HijriDate:
    jd = _gregorian_to_jd(d)
    year = floor((30 * (jd - ISLAMIC_EPOCH) + 10646) / 10631)
    month = min(12, ceil((jd - (29 + _islamic_to_jd(year, 1, 1))) / 29.5) + 1)
    day = int(jd - _islamic_to_jd(year, month, 1) + 1)
    return HijriDate(year=int(year), month=int(month), day=int(day))


def add_hijri_month(h: HijriDate, months: int = 1) -> HijriDate:
    m0 = (h.month - 1) + months
    year = h.year + m0 // 12
    month = (m0 % 12) + 1
    return HijriDate(year=year, month=month, day=1)


def hijri_today_utc() -> tuple[date, HijriDate, HijriDate]:
    g = datetime.now(timezone.utc).date()
    h = gregorian_to_hijri_civil(g)
    nxt = add_hijri_month(HijriDate(h.year, h.month, h.day), 1)
    return g, h, nxt


def hijri_civil_to_gregorian(h: HijriDate) -> date:
    jd = _islamic_to_jd(h.year, h.month, h.day)
    return _jd_to_gregorian(jd)

