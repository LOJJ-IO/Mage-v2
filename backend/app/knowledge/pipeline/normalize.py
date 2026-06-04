"""Merge extracted facts; conflicts → status=conflict."""
from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

_METHOD_WEIGHT = {
    "json_ld": 100,
    "policy_box": 95,
    "open_graph": 78,
    "jina_markdown": 88,
    "firecrawl": 87,
    "footer_contact": 86,
    "google_places": 93,
    "selector": 85,
    "faq": 80,
    "labeled_regex": 70,
    "meta": 60,
    "regex": 40,
    "booking_widget": 5,
}

_HIGH_PRIORITY_PATH_TOKENS = (
    "our-hotel",
    "overview",
    "amenit",
    "dining",
    "contact",
    "location",
    "polic",
    "faq",
)

_LOW_PRIORITY_PATH_TOKENS = (
    "book",
    "reservation",
    "rates",
    "offers",
    "privacy",
    "legal",
    "cookie",
    "tracking",
)


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
                winner, loser = _resolve_conflict(existing, fact)
                merged[key] = {
                    **winner,
                    "status": "filled",
                    "conflict_value": loser.get("value"),
                    "conflict_source_url": loser.get("source_url"),
                    "conflict_confidence": loser.get("confidence"),
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


def _source_score(fact: dict[str, Any]) -> float:
    confidence = float(fact.get("confidence") or 0)
    method = str(fact.get("extraction_method") or "regex")
    return confidence * 100 + _METHOD_WEIGHT.get(method, 0)


def _page_priority(source_url: str | None) -> int:
    if not source_url:
        return 0
    path = (urlparse(source_url).path or "/").lower()
    score = 0
    if path in ("", "/"):
        score += 20
    score += sum(10 for token in _HIGH_PRIORITY_PATH_TOKENS if token in path)
    score -= sum(12 for token in _LOW_PRIORITY_PATH_TOKENS if token in path)
    if "/faq/" in path:
        score -= 10
    return score


def _resolve_conflict(
    existing: dict[str, Any],
    incoming: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    existing_score = _source_score(existing)
    incoming_score = _source_score(incoming)
    if incoming_score > existing_score:
        return dict(incoming), dict(existing)
    if incoming_score < existing_score:
        return dict(existing), dict(incoming)

    existing_page_priority = _page_priority(existing.get("source_url"))
    incoming_page_priority = _page_priority(incoming.get("source_url"))
    if incoming_page_priority > existing_page_priority:
        return dict(incoming), dict(existing)
    return dict(existing), dict(incoming)
