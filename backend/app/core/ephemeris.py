from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Final

from skyfield.api import Loader


BACKEND_DIR: Final[Path] = Path(__file__).resolve().parents[2]
SKYFIELD_DIR: Final[Path] = BACKEND_DIR / "data" / "skyfield"
DEFAULT_EPHEMERIS: Final[str] = "de421.bsp"
DEFAULT_EPHEMERIS_SHA256: Final[str] = "a20a7139da04cbc462454634918e9a9ca69127044e2cc9d4f9c16e238d2deedc"

_load = Loader(str(SKYFIELD_DIR))
_ts = None
_eph = None


@dataclass(frozen=True)
class EphemerisInfo:
    file: str
    sha256: str
    size_bytes: int
    mtime_utc: str


def get_timescale():
    global _ts
    if _ts is None:
        _ts = _load.timescale()
    return _ts


@lru_cache(maxsize=4)
def _sha256(path_text: str, size_bytes: int, mtime_ns: int) -> str:
    # The file metadata is part of the cache key so an updated download is
    # always re-hashed before use.
    del size_bytes, mtime_ns
    digest = hashlib.sha256()
    with Path(path_text).open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _verified_digest(path: Path) -> str:
    stat = path.stat()
    actual = _sha256(str(path), stat.st_size, stat.st_mtime_ns)
    if not hmac.compare_digest(actual, DEFAULT_EPHEMERIS_SHA256):
        raise RuntimeError(
            f"Ephemeris checksum mismatch for {DEFAULT_EPHEMERIS}; "
            "delete the cached file and retry the download"
        )
    return actual


def get_ephemeris():
    global _eph
    if _eph is None:
        candidate = _load(DEFAULT_EPHEMERIS)
        try:
            _verified_digest(SKYFIELD_DIR / DEFAULT_EPHEMERIS)
        except Exception:
            candidate.close()
            raise
        _eph = candidate
    return _eph


def get_ephemeris_info() -> EphemerisInfo:
    # Loading verifies the downloaded kernel before any metadata is exposed.
    get_ephemeris()
    path = SKYFIELD_DIR / DEFAULT_EPHEMERIS
    st = path.stat()
    return EphemerisInfo(
        file=DEFAULT_EPHEMERIS,
        sha256=_verified_digest(path),
        size_bytes=st.st_size,
        mtime_utc=datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
    )
