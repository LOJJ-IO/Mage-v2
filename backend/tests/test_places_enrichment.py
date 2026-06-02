"""Tests for Google Places API hotel pre-enrichment."""

from __future__ import annotations

import asyncio

from unittest.mock import AsyncMock, patch

from app.knowledge.pipeline.places_enrichment import (
    _extract_hotel_name_from_url,
    _normalize_places_time,
    enrich_from_places,
    find_place_id,
    fetch_place_details,
    map_places_to_slots,
)


def test_extract_name_hyatt():
    url = "https://www.hyatt.com/hyatt-place/en-US/yegzw-hyatt-place-edmonton-west"
    name = _extract_hotel_name_from_url(url)
    assert "Edmonton" in name or "Hyatt" in name


def test_extract_name_fallback_independent():
    url = "https://www.grandhotelchicago.com/"
    name = _extract_hotel_name_from_url(url)
    assert len(name) > 3


def test_normalize_iso_time():
    assert _normalize_places_time("T15:00") == "3:00 PM"
    assert _normalize_places_time("T04:00") == "4:00 AM"
    assert _normalize_places_time("T12:00") == "12:00 PM"
    assert _normalize_places_time("T00:00") == "12:00 AM"


def test_normalize_plain_time():
    assert _normalize_places_time("3:00 PM") == "3:00 PM"


def test_map_places_basic_fields():
    details = {
        "name": "Hyatt Place Edmonton West",
        "formatted_address": "18004 100 Ave NW, Edmonton, AB T5S 0C5, Canada",
        "formatted_phone_number": "(780) 484-8000",
    }
    slots = map_places_to_slots(details)
    assert slots["property.name"] == ("Hyatt Place Edmonton West", 0.92)
    assert slots["property.location"][1] == 0.92
    assert slots["property.front_desk.phone"][1] == 0.92


def test_map_places_empty():
    assert map_places_to_slots({}) == {}


def test_enrich_returns_empty_without_api_key():
    result = asyncio.run(enrich_from_places("https://www.hyatt.com/hyatt-place/en-US/test", api_key=""))
    assert result == {}


def test_enrich_full_flow():
    mock_details = {
        "name": "Grand Hotel Edmonton",
        "formatted_address": "123 Main St, Edmonton, AB",
        "formatted_phone_number": "(780) 555-1234",
    }

    async def _fake_find_place_id(*args, **kwargs):
        return "ChIJtest123"

    async def _fake_fetch_place_details(*args, **kwargs):
        return mock_details

    with (
        patch("app.knowledge.pipeline.places_enrichment.find_place_id", new=AsyncMock(side_effect=_fake_find_place_id)),
        patch(
            "app.knowledge.pipeline.places_enrichment.fetch_place_details",
            new=AsyncMock(side_effect=_fake_fetch_place_details),
        ),
    ):
        result = asyncio.run(enrich_from_places("https://www.grandhotel.com", api_key="fake_key"))

    assert "property.name" in result
    assert result["property.name"]["value"] == "Grand Hotel Edmonton"
    assert result["property.name"]["extraction_method"] == "google_places"
    assert result["property.name"]["confidence"] == 0.92
    assert "property.location" in result
    assert "property.front_desk.phone" in result


def test_places_beats_regex_in_normalize_conflict():
    """Places facts should win over regex facts in normalize_facts."""
    from app.knowledge.pipeline.normalize import normalize_facts

    regex_batch = {
        "property.name": {
            "value": "Wrong Name from Regex",
            "confidence": 0.65,
            "extraction_method": "regex",
            "source_url": "https://example.com/book",
            "status": "filled",
        }
    }
    places_batch = {
        "property.name": {
            "value": "Correct Name from Places",
            "confidence": 0.92,
            "extraction_method": "google_places",
            "source_url": "https://maps.googleapis.com/...",
            "status": "filled",
        }
    }

    merged = normalize_facts([regex_batch, places_batch])
    assert merged["property.name"]["value"] == "Correct Name from Places"

    merged2 = normalize_facts([places_batch, regex_batch])
    assert merged2["property.name"]["value"] == "Correct Name from Places"

