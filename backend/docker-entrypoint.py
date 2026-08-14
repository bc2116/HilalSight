#!/usr/bin/env python3
"""Repair named-volume ownership, drop privileges, and start HilalSight."""

from __future__ import annotations

import os
import sys
from pathlib import Path


APP_UID = 10001
APP_GID = 10001
WRITABLE_DIRECTORIES = (Path("/app/data/skyfield"), Path("/app/.cache"))
OWNERSHIP_MARKER = ".hilalsight-uid-10001"


def ensure_owned(directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    marker = directory / OWNERSHIP_MARKER
    if marker.exists():
        return

    for root, _directories, files in os.walk(directory, followlinks=False):
        root_path = Path(root)
        os.chown(root_path, APP_UID, APP_GID, follow_symlinks=False)
        for filename in files:
            os.chown(root_path / filename, APP_UID, APP_GID, follow_symlinks=False)

    marker.touch(exist_ok=True)
    os.chown(marker, APP_UID, APP_GID, follow_symlinks=False)


def main() -> None:
    if os.geteuid() != 0:
        raise SystemExit("HilalSight's container entrypoint must start as root to repair mounted-volume ownership")
    if len(sys.argv) < 2:
        raise SystemExit("No command supplied")

    for directory in WRITABLE_DIRECTORIES:
        ensure_owned(directory)

    os.environ["HOME"] = "/app"
    os.setgroups([])
    os.setgid(APP_GID)
    os.setuid(APP_UID)
    os.umask(0o027)
    # The command is the image-controlled Docker CMD, executed directly with no shell.
    os.execvp(sys.argv[1], sys.argv[1:])  # nosec B606


if __name__ == "__main__":
    main()
