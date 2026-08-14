from __future__ import annotations

from datetime import date, timedelta, timezone
from typing import Any

from .hijri import (
    HijriDate,
    add_hijri_month,
    gregorian_to_hijri_civil,
    hijri_civil_to_gregorian,
)
from .newmoon import next_new_moon


CALENDAR_LABEL = "Islamic Civil (tabular reference)"
CONTEXT_NOTE = (
    "Hijri days begin at local sunset, and month starts may differ by location, "
    "calendar, or authority. Visibility projections do not establish an official date."
)
TRANSITION_DAYS = 3
MAX_CONJUNCTION_BOUNDARY_DISTANCE_DAYS = 7


class MonthContextError(RuntimeError):
    """Raised when a projection lunation cannot be aligned to its reference month."""


def _month(hijri: HijriDate) -> HijriDate:
    return HijriDate(year=hijri.year, month=hijri.month, day=1)


def _month_payload(hijri: HijriDate) -> dict[str, int | str]:
    return {
        "year": hijri.year,
        "month": hijri.month,
        "monthName": hijri.month_name,
    }


def build_month_context(
    reference_date: date,
    *,
    projection_date_min: date,
    projection_date_max: date,
) -> dict[str, Any]:
    """Build display-month and default-lunation context for a local civil date.

    Islamic Civil supplies only a deterministic reference boundary. Visibility
    results never influence the displayed month or the selected lunation.
    """

    reference_hijri = gregorian_to_hijri_civil(reference_date)
    current_month = _month(reference_hijri)
    previous_month = add_hijri_month(current_month, -1)
    next_month = add_hijri_month(current_month, 1)

    current_boundary = hijri_civil_to_gregorian(current_month)
    next_boundary = hijri_civil_to_gregorian(next_month)
    month_length = (next_boundary - current_boundary).days

    transition: dict[str, Any] | None
    display_month: dict[str, int | str] | None
    if reference_hijri.day <= TRANSITION_DAYS:
        mode = "transition"
        entering_month = current_month
        target_boundary = current_boundary
        transition = {
            "phase": "after",
            "leavingMonth": _month_payload(previous_month),
            "enteringMonth": _month_payload(entering_month),
            "referenceBoundaryDate": target_boundary.isoformat(),
        }
        display_month = None
    elif reference_hijri.day >= month_length - TRANSITION_DAYS + 1:
        mode = "transition"
        entering_month = next_month
        target_boundary = next_boundary
        transition = {
            "phase": "before",
            "leavingMonth": _month_payload(current_month),
            "enteringMonth": _month_payload(entering_month),
            "referenceBoundaryDate": target_boundary.isoformat(),
        }
        display_month = None
    else:
        mode = "stable"
        entering_month = next_month
        target_boundary = next_boundary
        transition = None
        display_month = _month_payload(current_month)

    conjunction = next_new_moon(target_boundary - timedelta(days=15))
    if conjunction.tzinfo is None:
        raise MonthContextError("New-moon calculation returned a timezone-naive timestamp")
    conjunction_utc = conjunction.astimezone(timezone.utc)
    boundary_distance = abs((conjunction_utc.date() - target_boundary).days)
    if boundary_distance > MAX_CONJUNCTION_BOUNDARY_DISTANCE_DAYS:
        raise MonthContextError(
            "New-moon calculation did not align with the target reference month boundary"
        )

    projection_date = conjunction_utc.date()
    default_projection: dict[str, Any] | None = None
    if projection_date_min <= projection_date <= projection_date_max:
        default_projection = {
            "targetMonth": _month_payload(entering_month),
            "dateLabel": projection_date.isoformat(),
            "conjunctionUtc": conjunction_utc.isoformat().replace("+00:00", "Z"),
            "relation": "recent" if projection_date < reference_date else "upcoming",
        }

    return {
        "referenceDate": reference_date.isoformat(),
        "mode": mode,
        "month": display_month,
        "transition": transition,
        "calendar": CALENDAR_LABEL,
        "note": CONTEXT_NOTE,
        "defaultProjection": default_projection,
    }
