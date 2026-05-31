"""Load canonical knowledge schema from repo."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

_SCHEMA_PATH = Path(__file__).resolve().parent / "schema" / "v1.json"


@lru_cache()
def load_schema(version: str = "v1") -> dict[str, Any]:
    if version != "v1":
        raise ValueError(f"Unsupported schema version: {version}")
    return json.loads(_SCHEMA_PATH.read_text(encoding="utf-8"))


def get_slots(version: str = "v1") -> list[dict[str, Any]]:
    return load_schema(version).get("slots", [])


def slot_by_key(version: str = "v1") -> dict[str, dict[str, Any]]:
    return {s["key"]: s for s in get_slots(version)}


def tier_keys(tier: str, version: str = "v1") -> list[str]:
    return [s["key"] for s in get_slots(version) if s.get("tier") == tier]
