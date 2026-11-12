"""Filesystem locations. Raw downloads are gitignored; data/ is tracked."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG_FILE = ROOT / "config" / "config.yml"
RAW = ROOT / "raw"
DATA = ROOT / "data"
META = DATA / "meta"
