"""Suggest and append Booking.com listing URLs from a hotel website seed."""
from __future__ import annotations

import logging
import re
from typing import Any
from urllib.parse import quote_plus, urlparse

import httpx

from app.knowledge.pipeline.crawl_http import crawl_client, crawl_throttle, fetch_all_free_methods
from app.knowledge.pipeline.crawl_scope import is_aggregator_url, normalize_seed_url
from app.knowledge.pipeline.places_enrichment import _extract_hotel_name_from_url

logger = logging.getLogger(__name__)

_BOOKING_HOSTS = frozenset({"booking.com", "www.booking.com"})
_PAGE_SEGMENTS = frozenset(
    {
        "amenities",
        "faq",
        "faqs",
        "overview",
        "policies",
        "contact",
        "rooms",
        "dining",
        "gallery",
    }
)
_BOOKING_HOTEL_RE = re.compile(
    r"https?://(?:www\.)?booking\.com/hotel/[a-z]{2}/[^\s\"'<>?)]+",
    re.I,
)


def is_booking_hotel_url(url: str) -> bool:
    parsed = urlparse(normalize_seed_url(url))
    host = (parsed.netloc or "").lower().lstrip("www.")
    if host not in _BOOKING_HOSTS and not host.endswith(".booking.com"):
        return False
    return "/hotel/" in (parsed.path or "").lower()


def has_booking_hotel_seed(seeds: list[str]) -> bool:
    return any(is_booking_hotel_url(url) for url in seeds)


def booking_search_query_from_seed(seed_url: str) -> str:
    return _extract_hotel_name_from_url(seed_url)


def booking_search_url(query: str) -> str:
    q = (query or "").strip()
    if not q:
        return "https://www.booking.com/"
    return f"https://www.booking.com/searchresults.html?ss={quote_plus(q)}&lang=en-us"


def normalize_booking_hotel_url(url: str) -> str:
    parsed = urlparse(normalize_seed_url(url))
    path = (parsed.path or "").split("?")[0].rstrip("/")
    if not path.endswith(".html"):
        path = f"{path}.html"
    return f"https://www.booking.com{path}"


def extract_booking_hotel_urls(html: str) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    for match in _BOOKING_HOTEL_RE.findall(html or ""):
        cleaned = normalize_booking_hotel_url(match.split('"')[0].split("'")[0])
        if cleaned not in seen:
            seen.add(cleaned)
            found.append(cleaned)
    return found


_CANADIAN_MARKERS = (
    "edmonton",
    "toronto",
    "vancouver",
    "calgary",
    "ottawa",
    "montreal",
    "winnipeg",
    "halifax",
    "quebec",
    "victoria",
    "mississauga",
)


def _guess_country_code(parsed) -> str:
    path = (parsed.path or "").lower()
    host = (parsed.netloc or "").lower()
    blob = f"{path} {host}"
    if any(marker in blob for marker in _CANADIAN_MARKERS):
        return "ca"
    if "/en-ca" in path or "/fr-ca" in path or path.startswith("/ca/"):
        return "ca"
    if host.endswith(".ca"):
        return "ca"
    if "/en-gb" in path or "/gb/" in path:
        return "gb"
    if "/en-au" in path or "/au/" in path:
        return "au"
    return "us"


def guess_booking_hotel_url(seed_url: str) -> str | None:
    """Build a likely booking.com/hotel/{cc}/{slug}.html URL from the seed path."""
    raw = normalize_seed_url(seed_url)
    if not raw or is_aggregator_url(raw):
        return None

    parsed = urlparse(raw)
    segments = [s for s in parsed.path.split("/") if s]
    if not segments:
        return None

    slug = segments[-1].lower()
    if slug in _PAGE_SEGMENTS and len(segments) > 1:
        slug = segments[-2].lower()

    slug = re.sub(r"^[a-z]{2}-[a-z]{2}-?", "", slug)
    slug = re.sub(r"^[a-z]{3,5}[a-z0-9]{1,3}-", "", slug)
    if len(slug) < 6 or slug in _PAGE_SEGMENTS:
        return None

    country = _guess_country_code(parsed)
    return f"https://www.booking.com/hotel/{country}/{slug}.html"


async def _booking_hotel_url_reachable(url: str) -> bool:
    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=12.0,
            headers={"User-Agent": "Mozilla/5.0 (compatible; MageBot/1.0)"},
        ) as client:
            resp = await client.get(url)
            final = str(resp.url).lower()
            if resp.status_code != 200:
                return False
            if "/hotel/" not in final:
                return False
            if "searchresults" in final:
                return False
            return True
    except Exception as e:
        logger.debug("Booking URL probe failed for %s: %s", url, e)
    return False


async def _fetch_primary_html(seed_url: str) -> str | None:
    """Fetch hotel seed page via all free methods; prefer HTML for link extraction."""
    try:
        await crawl_throttle()
        async with crawl_client(timeout=12.0) as client:
            results = await fetch_all_free_methods(client, seed_url)
            if not results:
                return None
            prefer_order = (
                "httpx",
                "httpx_googlebot",
                "httpx_browser",
                "playwright",
                "google_cache",
                "wayback",
                "jina",
            )
            for method in prefer_order:
                for res in results:
                    if res.method == method or res.method.startswith(method):
                        return res.text
            return results[0].text
    except Exception as e:
        logger.debug("Seed fetch for Booking discovery failed %s: %s", seed_url, e)
    return None


async def suggest_booking_for_seed(
    seed_url: str,
    *,
    probe: bool = True,
    fetch_page_links: bool = True,
) -> dict[str, Any]:
    """Return Booking.com hotel URL guess, search URL, and how it was derived."""
    primary = normalize_seed_url(seed_url)
    query = booking_search_query_from_seed(primary)
    search_url = booking_search_url(query)
    result: dict[str, Any] = {
        "seed_url": primary,
        "search_query": query,
        "search_url": search_url,
        "hotel_url": None,
        "source": None,
        "verified": False,
    }

    if not primary or is_aggregator_url(primary):
        return result

    if is_booking_hotel_url(primary):
        result["hotel_url"] = normalize_booking_hotel_url(primary)
        result["source"] = "seed"
        result["verified"] = True
        return result

    guessed = guess_booking_hotel_url(primary)
    if fetch_page_links:
        html = await _fetch_primary_html(primary)
        if html:
            links = extract_booking_hotel_urls(html)
            if links:
                result["hotel_url"] = links[0]
                result["source"] = "page_link"
                if probe:
                    result["verified"] = await _booking_hotel_url_reachable(links[0])
                return result

    if guessed:
        result["hotel_url"] = guessed
        result["source"] = "slug_guess"
        if probe:
            result["verified"] = await _booking_hotel_url_reachable(guessed)
        return result

    return result


async def augment_seeds_with_booking(seeds: list[str]) -> tuple[list[str], dict[str, Any]]:
    """
    Discover a Booking.com hotel listing from the primary hotel website seed and
    append it when missing.

    Runs even when the caller already supplied an optional Booking.com URL — we
    always try to find the listing from the hotel site first.
    """
    meta: dict[str, Any] = {
        "added": None,
        "search_url": None,
        "search_query": None,
        "source": None,
        "verified": False,
    }
    if not seeds:
        return seeds, meta

    primary_hotel = next((s for s in seeds if not is_aggregator_url(s)), None)
    if not primary_hotel:
        return seeds, meta

    suggestion = await suggest_booking_for_seed(
        primary_hotel, probe=True, fetch_page_links=True
    )
    meta["search_url"] = suggestion.get("search_url")
    meta["search_query"] = suggestion.get("search_query")
    meta["source"] = suggestion.get("source")
    meta["verified"] = suggestion.get("verified")

    hotel_url = suggestion.get("hotel_url")
    if not hotel_url:
        logger.info(
            "Booking augment: no hotel URL for %s (search: %s)",
            primary_hotel,
            meta["search_url"],
        )
        return seeds, meta

    normalized = normalize_booking_hotel_url(str(hotel_url))
    if normalized in seeds:
        return seeds, meta

    logger.info(
        "Booking augment: added %s for %s (source=%s, verified=%s)",
        normalized,
        primary_hotel,
        meta["source"],
        meta["verified"],
    )
    meta["added"] = normalized
    return [*seeds, normalized], meta
