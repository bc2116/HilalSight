from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta, timezone
from threading import Lock, Thread
from time import sleep
from typing import Any
from uuid import uuid4

from .map_grid import COMPUTE_LOCK_TIMEOUT_SECONDS, MapComputationBusy, compute_map_cached
from .newmoon import next_new_moon


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class WarmJob:
    id: str
    status: str  # queued|running|done|error
    monthsAhead: int
    evenings: int
    resolution: float
    fromDate: str
    createdUtc: str
    startedUtc: str | None
    finishedUtc: str | None
    totalMaps: int
    doneMaps: int
    current: str | None
    error: str | None


_lock = Lock()
_job: WarmJob | None = None
_thread: Thread | None = None


def _set_job(**updates: Any) -> None:
    global _job
    if _job is None:
        return
    for k, v in updates.items():
        setattr(_job, k, v)


def _worker(job_id: str) -> None:
    # Pull params once so we don't hold the lock during heavy compute.
    with _lock:
        if _job is None or _job.id != job_id:
            return
        _set_job(status="running", startedUtc=_utcnow())
        months_ahead = int(_job.monthsAhead)
        evenings = int(_job.evenings)
        resolution = float(_job.resolution)
        start_date = date.fromisoformat(_job.fromDate)

    try:
        d = start_date
        for _ in range(months_ahead):
            nm = next_new_moon(d)
            date_label = nm.date()
            for day_offset in range(evenings):
                with _lock:
                    if _job is None or _job.id != job_id:
                        return
                    _set_job(current=f"{date_label.isoformat()} day{day_offset}")

                # Compute + populate disk cache (compute_map_cached is idempotent).
                while True:
                    try:
                        compute_map_cached(date_label, day_offset, resolution)
                        break
                    except MapComputationBusy:
                        sleep(COMPUTE_LOCK_TIMEOUT_SECONDS)

                with _lock:
                    if _job is None or _job.id != job_id:
                        return
                    _set_job(doneMaps=int(_job.doneMaps) + 1)

            # Next search starts after this conjunction.
            d = date_label + timedelta(days=1)

        with _lock:
            if _job is not None and _job.id == job_id:
                _set_job(status="done", finishedUtc=_utcnow(), current=None)
    except Exception as e:  # pragma: no cover (best-effort background job)
        with _lock:
            if _job is not None and _job.id == job_id:
                _set_job(status="error", finishedUtc=_utcnow(), current=None, error=str(e))


def start_warm_job(months_ahead: int, evenings: int, resolution: float, from_date: date | None = None) -> WarmJob:
    """Start a background cache-warm job, or return the currently running one."""
    global _job, _thread
    with _lock:
        if _job is not None and _job.status in ("queued", "running"):
            return _job

        fd = from_date or date.today()
        job = WarmJob(
            id=str(uuid4()),
            status="queued",
            monthsAhead=int(months_ahead),
            evenings=int(evenings),
            resolution=float(resolution),
            fromDate=fd.isoformat(),
            createdUtc=_utcnow(),
            startedUtc=None,
            finishedUtc=None,
            totalMaps=int(months_ahead) * int(evenings),
            doneMaps=0,
            current=None,
            error=None,
        )
        _job = job
        _thread = Thread(target=_worker, args=(job.id,), daemon=True)
        _thread.start()
        return job


def get_warm_status() -> dict[str, Any]:
    with _lock:
        if _job is None:
            return {"running": False, "job": None}
        running = _job.status in ("queued", "running")
        return {"running": running, "job": asdict(_job)}
