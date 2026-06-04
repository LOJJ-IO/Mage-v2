"""Google Places API enrichment for hotel property facts.

This runs as a pre-crawl enrichment step in runner.py:
  enrich_from_places(...) -> {slot_key: fact_dict}

The returned fact dict format matches extract_facts_from_page outputs, so
normalize_facts can merge/conflict-resolve using extraction_method weights.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Optional
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)

_PLACES_FIND_URL = "https://maps.googleapis.com/maps/api/place/findplacefromtext/json"
_PLACES_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"

# Fields to request from Places Details API
_DETAILS_FIELDS = [
    "name",
    "formatted_address",
    "formatted_phone_number",
    "international_phone_number",
    "website",
    "types",
    "opening_hours",
    "utc_offset_minutes",
    "rating",
    "user_ratings_total",
    "price_level",
]


def _extract_hotel_name_from_url(url: str) -> str:
    """Derive a searchable hotel name from the seed URL as fallback.

    Example:
      https://www.hyatt.com/hyatt-place/en-US/yegzw-hyatt-place-edmonton-west
      → "Hyatt Place Edmonton West"
    """
    parsed = urlparse(url)
    path = (parsed.path or "").lower()

    # Extract last meaningful path segment
    segments = [s for s in path.split("/") if s and len(s) > 3]
    if not segments:
        return (
            (parsed.netloc or "").replace("www.", "").replace(".com", "").replace("-", " ").title()
        )

    last = segments[-1]
    original_slug = last

    # Strip locale codes like "en-US", "en-CA"
    last = re.sub(r"^[a-z]{2}-[A-Z]{2}-?", "", last, flags=re.I)

    # Strip property codes like "yegzw-" (Hyatt/Marriott path slugs), not city names.
    stripped = re.sub(r"^[a-z]{3,5}[a-z0-9]{1,3}-", "", last, flags=re.I)
    if stripped and stripped != last:
        # Only accept the strip when enough slug remains (avoid "edmonton-west" → "west").
        if len(stripped.replace("-", " ")) >= 8 or stripped.count("-") >= 2:
            last = stripped
        else:
            last = original_slug

    # Replace hyphens with spaces and title-case
    name = last.replace("-", " ").title()

    # Prepend brand from domain if not already in name
    domain = (parsed.netloc or "").lower().replace("www.", "")
    brand_hints = {
        "hyatt": "Hyatt",
        "marriott": "Marriott",
        "hilton": "Hilton",
        "ihg": "IHG",
        "choicehotels": "Choice Hotels",
        "wyndham": "Wyndham",
        "bestwestern": "Best Western",
        "sandmanhotels": "Sandman Hotel",
        "sandman": "Sandman Hotel",
        "comfortinn": "Comfort Inn",
    }
    for domain_key, brand in brand_hints.items():
        if domain_key in domain and brand.lower() not in name.lower():
            name = f"{brand} {name}"
            break

    return name.strip()


async def find_place_id(
    hotel_name: str,
    seed_url: str,
    *,
    api_key: str,
) -> Optional[str]:
    """Find Google Places place_id for a hotel (Find Place From Text)."""
    search_input = hotel_name if hotel_name else _extract_hotel_name_from_url(seed_url)

    # Ensure "hotel" is in the query to avoid matching non-hotel businesses.
    if not any(
        w in search_input.lower()
        for w in ("hotel", "inn", "suites", "resort", "lodge", "motel", "place")
    ):
        search_input = f"{search_input} hotel"

    params = {
        "input": search_input,
        "inputtype": "textquery",
        "fields": "place_id,name,types",
        "key": api_key,
    }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(_PLACES_FIND_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.warning("Places API findplace failed: %s", e)
        return None

    candidates = data.get("candidates", [])
    if not candidates:
        logger.info("Places API: no candidates found for '%s'", search_input)
        return None

    # Prefer candidates with lodging type.
    for candidate in candidates:
        types = candidate.get("types", []) or []
        if any(t in types for t in ("lodging", "hotel", "establishment")):
            logger.info(
                "Places API: matched '%s' → place_id=%s", search_input, candidate.get("place_id")
            )
            return candidate.get("place_id")

    return candidates[0].get("place_id")


async def fetch_place_details(
    place_id: str,
    *,
    api_key: str,
) -> dict[str, Any]:
    """Fetch full place details for a given place_id (Place Details)."""
    params = {
        "place_id": place_id,
        "fields": ",".join(_DETAILS_FIELDS),
        "key": api_key,
    }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(_PLACES_DETAILS_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.warning("Places API details fetch failed: %s", e)
        return {}

    if data.get("status") != "OK":
        logger.warning(
            "Places API details status: %s for place_id=%s", data.get("status"), place_id
        )
        return {}

    return data.get("result", {}) or {}


def _normalize_places_time(raw: str) -> Optional[str]:
    """Normalize Places time string to `H:MM AM/PM` format."""
    if not raw:
        return None

    # Places check-in/out sometimes comes as "T15:00" or "15:00" (24h).
    iso_match = re.search(r"T?(\d{2}):(\d{2})", raw)
    if iso_match:
        hour = int(iso_match.group(1))
        minute = int(iso_match.group(2))
        suffix = "AM" if hour < 12 else "PM"
        display_hour = hour % 12 or 12
        return f"{display_hour}:{minute:02d} {suffix}"

    # Already in "3:00 PM" format.
    if re.search(r"\d+:\d+\s*(AM|PM)", raw, re.IGNORECASE):
        return raw.strip()

    # Try raw 4-digit 24h "1500" -> "3:00 PM"
    m = re.search(r"(?<!\d)(\d{2})(\d{2})(?!\d)", raw)
    if m:
        hour = int(m.group(1))
        minute = int(m.group(2))
        if 0 <= hour <= 23 and 0 <= minute <= 59:
            suffix = "AM" if hour < 12 else "PM"
            display_hour = hour % 12 or 12
            return f"{display_hour}:{minute:02d} {suffix}"

    return None


def map_places_to_slots(details: dict[str, Any]) -> dict[str, tuple[Any, float]]:
    """Map Google Places API result fields to hotel slot keys."""
    facts: dict[str, tuple[Any, float]] = {}
    if not details:
        return facts

    name = str(details.get("name", "") or "").strip()
    if name and len(name) > 3:
        facts["property.name"] = (name, 0.92)

    address = str(details.get("formatted_address", "") or "").strip()
    if address:
        facts["property.location"] = (address, 0.92)

    phone = (details.get("formatted_phone_number") or details.get("international_phone_number") or "").strip()
    if phone:
        facts["property.front_desk.phone"] = (phone, 0.92)

    website = str(details.get("website", "") or "").strip()
    if website:
        facts["property.website"] = (website, 0.90)

    opening_hours = details.get("opening_hours") or {}
    special = opening_hours.get("special_days") if isinstance(opening_hours, dict) else None
    if isinstance(special, dict):
        check_in_raw = (special.get("check_in_time") or {}).get("time") if isinstance(special.get("check_in_time"), dict) else special.get("check_in_time")
        if check_in_raw:
            normalized = _normalize_places_time(str(check_in_raw))
            if normalized:
                facts["property.check_in.time"] = (normalized, 0.92)

        check_out_raw = (special.get("check_out_time") or {}).get("time") if isinstance(special.get("check_out_time"), dict) else special.get("check_out_time")
        if check_out_raw:
            normalized = _normalize_places_time(str(check_out_raw))
            if normalized:
                facts["property.check_out.time"] = (normalized, 0.92)

    return facts


async def enrich_from_places(
    seed_url: str,
    *,
    api_key: str,
    hotel_name: Optional[str] = None,
) -> dict[str, dict[str, Any]]:
    """Main entry point. Returns a facts batch in extract_facts_from_page format."""
    if not api_key:
        logger.debug("Google Places API key not configured; skipping enrichment")
        return {}

    search_name = hotel_name or _extract_hotel_name_from_url(seed_url)
    place_id = await find_place_id(search_name, seed_url, api_key=api_key)
    if not place_id:
        logger.info("Places enrichment: no place_id found for %s", seed_url)
        return {}

    details = await fetch_place_details(place_id, api_key=api_key)
    if not details:
        logger.info("Places enrichment: empty details for place_id=%s", place_id)
        return {}

    slot_values = map_places_to_slots(details)
    if not slot_values:
        return {}

    facts: dict[str, dict[str, Any]] = {}
    for slot_key, (value, confidence) in slot_values.items():
        facts[slot_key] = {
            "value": value,
            "status": "filled",
            "confidence": confidence,
            "extraction_method": "google_places",
            "source_url": f"https://maps.googleapis.com/maps/api/place/details/{place_id}",
            "source_snippet": str(value)[:200],
        }

    logger.info(
        "Places enrichment: filled %d slots for %s (place_id=%s)",
        len(facts),
        seed_url,
        place_id,
    )
    return facts

