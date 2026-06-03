"""Tests for Booking.com seed augmentation."""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

from app.knowledge.pipeline.booking_seed import (
    augment_seeds_with_booking,
    booking_search_url,
    extract_booking_hotel_urls,
    guess_booking_hotel_url,
    has_booking_hotel_seed,
    normalize_booking_hotel_url,
)


def test_guess_booking_hotel_url_from_hyatt_path():
    url = "https://www.hyatt.com/hyatt-place/en-US/yegzw-hyatt-place-edmonton-west"
    assert guess_booking_hotel_url(url) == (
        "https://www.booking.com/hotel/ca/hyatt-place-edmonton-west.html"
    )


def test_booking_search_url():
    url = booking_search_url("Hyatt Place Edmonton West")
    assert "searchresults.html" in url
    assert "Hyatt+Place+Edmonton+West" in url


def test_extract_booking_hotel_urls():
    html = """
    <a href="https://www.booking.com/hotel/ca/hyatt-place-edmonton-west.en-gb.html?aid=123">
      Book on Booking.com
    </a>
    """
    links = extract_booking_hotel_urls(html)
    assert links == ["https://www.booking.com/hotel/ca/hyatt-place-edmonton-west.en-gb.html"]


def test_has_booking_hotel_seed():
    assert has_booking_hotel_seed(
        ["https://www.booking.com/hotel/ca/example.html"]
    )
    assert not has_booking_hotel_seed(["https://www.hyatt.com/hotel"])


def test_normalize_booking_hotel_url():
    assert normalize_booking_hotel_url(
        "https://www.booking.com/hotel/ca/foo"
    ) == "https://www.booking.com/hotel/ca/foo.html"


def test_augment_skips_when_booking_already_present():
    async def run():
        seeds = [
            "https://www.hyatt.com/hyatt-place/en-US/yegzw-hyatt-place-edmonton-west",
            "https://www.booking.com/hotel/ca/hyatt-place-edmonton-west.html",
        ]
        return await augment_seeds_with_booking(seeds)

    out, meta = asyncio.run(run())
    assert out == [
        "https://www.hyatt.com/hyatt-place/en-US/yegzw-hyatt-place-edmonton-west",
        "https://www.booking.com/hotel/ca/hyatt-place-edmonton-west.html",
    ]
    assert meta["added"] is None


def test_augment_adds_guessed_booking_url():
    async def run():
        with patch(
            "app.knowledge.pipeline.booking_seed.suggest_booking_for_seed",
            new_callable=AsyncMock,
        ) as mock_suggest:
            mock_suggest.return_value = {
                "hotel_url": "https://www.booking.com/hotel/ca/hyatt-place-edmonton-west.html",
                "search_url": "https://www.booking.com/searchresults.html?ss=Hyatt",
                "search_query": "Hyatt Place Edmonton West",
                "source": "slug_guess",
                "verified": True,
            }
            seeds = ["https://www.hyatt.com/hyatt-place/en-US/yegzw-hyatt-place-edmonton-west"]
            return await augment_seeds_with_booking(seeds)

    out, meta = asyncio.run(run())
    assert len(out) == 2
    assert out[1].startswith("https://www.booking.com/hotel/")
    assert meta["added"] == out[1]
