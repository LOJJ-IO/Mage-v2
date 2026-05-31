"""Merge extracted facts; conflicts → status=conflict."""
from __future__ import annotations

from typing import Any


def normalize_facts(
    fact_batches: list[dict[str, dict[str, Any]]],
) -> dict[str, dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}

    for batch in fact_batches:
        for key, fact in batch.items():
            existing = merged.get(key)
            if not existing:
                merged[key] = dict(fact)
                continue
            if _values_equal(existing.get("value"), fact.get("value")):
                if (fact.get("confidence") or 0) > (existing.get("confidence") or 0):
                    merged[key] = dict(fact)
            else:
                merged[key] = {
                    **existing,
                    "status": "conflict",
                    "value": existing.get("value"),
                    "conflict_value": fact.get("value"),
                    "confidence": min(
                        existing.get("confidence") or 0.5,
                        fact.get("confidence") or 0.5,
                    ),
                }
    return merged


def gap_report(
    merged: dict[str, dict[str, Any]],
    tier_a_keys: list[str],
    tier_b_keys: list[str],
) -> dict[str, Any]:
    def missing(keys: list[str]) -> list[str]:
        out = []
        for k in keys:
            st = merged.get(k, {}).get("status")
            if st not in ("filled", "verified", "not_applicable"):
                out.append(k)
        return out

    return {
        "tier_a_missing": missing(tier_a_keys),
        "tier_b_missing": missing(tier_b_keys),
        "conflicts": [k for k, v in merged.items() if v.get("status") == "conflict"],
    }


def _values_equal(a: Any, b: Any) -> bool:
    if a is None and b is None:
        return True
    return str(a).strip().lower() == str(b).strip().lower()
