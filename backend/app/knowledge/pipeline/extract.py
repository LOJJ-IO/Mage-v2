"""Extract slot values from page HTML (MVP: heuristic + text blocks)."""
from __future__ import annotations

import re
from typing import Any

from app.knowledge.schema_loader import get_slots

_HOUR_PATTERN = re.compile(
    r"\b\d{1,2}\s*(?:am|pm|a\.m\.|p\.m\.)(?:\s*[-–—to]+\s*\d{1,2}\s*(?:am|pm|a\.m\.|p\.m\.))?",
    re.I,
)


def _strip_html(html: str) -> str:
    text = re.sub(r"<script[^>]*>.*?</script>", " ", html, flags=re.S | re.I)
    text = re.sub(r"<style[^>]*>.*?</style>", " ", text, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def classify_page_type(url: str, text: str) -> str:
    lower = (url + " " + text[:500]).lower()
    if "pool" in lower or "swim" in lower:
        return "pool"
    if "fitness" in lower or "gym" in lower:
        return "fitness"
    if "faq" in lower:
        return "faq"
    if "parking" in lower:
        return "parking"
    if "dining" in lower or "restaurant" in lower or "breakfast" in lower:
        return "dining"
    if "amenit" in lower:
        return "amenities"
    return "general"


def extract_facts_from_page(
    url: str,
    html: str,
    *,
    schema_version: str = "v1",
) -> dict[str, dict[str, Any]]:
    """
    MVP extract: keyword-triggered slot fills from page text.
    Website silence → status unknown (omit from result).
    """
    text = _strip_html(html)
    page_type = classify_page_type(url, text)
    lower = text.lower()
    extracted: dict[str, dict[str, Any]] = {}

    def set_slot(key: str, value: Any, confidence: float = 0.6) -> None:
        extracted[key] = {
            "value": value,
            "status": "filled",
            "confidence": confidence,
            "source_url": url,
            "source_snippet": str(value)[:200],
        }

    if page_type in ("pool", "amenities", "general"):
        if "pool" in lower:
            hours = _HOUR_PATTERN.search(text)
            if hours:
                set_slot("amenities.pool.hours", hours.group(0), 0.7)
            if re.search(r"\b(?:floor|level|located)\b", lower):
                loc_match = re.search(
                    r"(?:pool[^.]{0,80}?(?:floor|level \d|1st|2nd|3rd)|"
                    r"(?:floor|level \d)[^.]{0,40}?pool)",
                    lower,
                )
                if loc_match:
                    set_slot("amenities.pool.location", loc_match.group(0)[:120], 0.5)

    if page_type in ("fitness", "amenities", "general") and ("fitness" in lower or "gym" in lower):
        hours = _HOUR_PATTERN.search(text)
        if hours:
            set_slot("amenities.fitness.hours", hours.group(0), 0.65)

    if page_type in ("dining", "general") and any(w in lower for w in ("restaurant", "breakfast", "dining")):
        hours = _HOUR_PATTERN.search(text)
        if hours:
            set_slot("dining.restaurant.hours", hours.group(0), 0.65)

    if page_type == "parking" or "parking" in lower:
        set_slot("parking.self.available", True, 0.55)

    if "wifi" in lower or "wi-fi" in lower:
        net = re.search(r"(?:network|ssid)[:\s]+['\"]?(\w+)['\"]?", text, re.I)
        if net:
            set_slot("connectivity.wifi.network_name", net.group(1), 0.6)

    return extracted
