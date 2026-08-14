import sys
from pathlib import Path

# Let tests import `app.*` when executed from the repo root.
BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

