"""Tests for crawl scope and fact extraction."""
from __future__ import annotations

import re

from app.knowledge.pipeline.crawl_scope import (
    crawl_scope_from_seed,
    path_prefix_from_url,
    property_id_from_url,
    url_under_scope,
)
from app.knowledge.pipeline.discover import _clean_url, _select_urls
from app.knowledge.pipeline.extract import extract_facts_from_page
from app.knowledge.pipeline.normalize import normalize_facts


def test_property_id_includes_path():
    url = "https://www.marriott.com/en-us/hotels/yowcy-ottawa-marriott-hotel/overview"
    assert "marriott-com" in property_id_from_url(url)
    assert "yowcy-ottawa-marriott-hotel" in property_id_from_url(url)


def test_path_prefix_strips_page_segment():
    url = "https://brand.com/hotels/downtown-edmonton/faq"
    assert path_prefix_from_url(url) == "/hotels/downtown-edmonton"


def test_url_under_scope():
    scope = crawl_scope_from_seed("https://brand.com/hotels/downtown-edmonton")
    assert url_under_scope("https://brand.com/hotels/downtown-edmonton/amenities", scope)
    assert url_under_scope("https://brand.com/hotels/other-city/pool", scope) is False
    assert url_under_scope("https://brand.com/hotels/downtown-edmonton", scope)


def test_whole_domain_scope():
    scope = crawl_scope_from_seed("https://comfortinnedmonton.com")
    assert scope.path_prefix == ""
    assert url_under_scope("https://www.comfortinnedmonton.com/faq", scope)


def test_time_range_not_zero_fragment():
    html = """
    <html><body>
    <h2>Pool Hours</h2>
    <p>Our swimming pool is open from 6:00 AM to 10:00 PM daily.</p>
    </body></html>
    """
    facts = extract_facts_from_page("https://hotel.com/pool", html)
    hours = facts.get("amenities.pool.hours", {}).get("value", "")
    assert "6:00 AM" in hours
    assert "10:00 PM" in hours
    assert not re.search(r"(?<![:\d])00\s*(?:AM|PM)", hours)


def test_check_in_extraction():
    html = """
    <html><body>
    <p>Check-in time is 3:00 PM. Check-out time is 11:00 AM.</p>
    </body></html>
    """
    facts = extract_facts_from_page("https://hotel.com/policies", html)
    assert facts["property.check_in.time"]["value"] == "3:00 PM"
    assert facts["property.check_out.time"]["value"] == "11:00 AM"


def test_rejects_invalid_time():
    html = "<html><body><p>Pool open :00 PM daily</p></body></html>"
    facts = extract_facts_from_page("https://hotel.com/pool", html)
    assert "amenities.pool.hours" not in facts


def test_json_ld_beats_regex_extraction():
    html = """
    <html><body>
    <p>Check-in time is 3:00 PM.</p>
    <script type="application/ld+json">
    {"@type":"Hotel","name":"Comfort Inn Downtown","checkinTime":"16:00","checkoutTime":"11:00"}
    </script>
    </body></html>
    """
    facts = extract_facts_from_page("https://hotel.com/", html)
    assert facts["property.name"]["value"] == "Comfort Inn Downtown"
    assert facts["property.check_in.time"]["value"] == "4:00 PM"
    assert facts["property.check_in.time"]["extraction_method"] == "json_ld"
    assert facts["property.check_out.time"]["value"] == "11:00 AM"


def test_comfort_inn_policy_box_check_in():
    html = """
    <html><body>
    <header><p>Check-in: 3:00 PM Book now</p></header>
    <section class="about-info-wrap">
      <div class="about-info-desc">Check-In:</div>
      <div class="about-info-value">4:00 pm</div>
      <div class="about-info-desc">Check-Out:</div>
      <div class="about-info-value">11:00 am</div>
    </section>
    </body></html>
    """
    facts = extract_facts_from_page("https://www.comfortinnedmonton.com/about-amenities", html)
    assert facts["property.check_in.time"]["value"] == "4:00 PM"
    assert facts["property.check_in.time"]["extraction_method"] == "policy_box"
    assert facts["property.check_out.time"]["value"] == "11:00 AM"


def test_comfort_inn_policy_box_wins_over_homepage_widget():
    homepage = """
    <html><body>
    <div class="booking-bar">Check-in: 3:00 PM Select dates Book now</div>
    </body></html>
    """
    amenities = """
    <html><body>
    <div class="about-info-desc">Check-In:</div>
    <div class="about-info-value">4:00 pm</div>
    </body></html>
    """
    merged = normalize_facts(
        [
            extract_facts_from_page("https://www.comfortinnedmonton.com/", homepage),
            extract_facts_from_page("https://www.comfortinnedmonton.com/about-amenities", amenities),
        ]
    )
    assert merged["property.check_in.time"]["value"] == "4:00 PM"
    assert merged["property.check_in.time"]["extraction_method"] == "policy_box"


def test_booking_widget_context_is_ignored_for_times():
    html = """
    <html><body>
    <div class="booking-widget">
      <p>Reservations: Check-in: 3:00 PM Select your dates Book now</p>
    </div>
    <section>
      <h2>Information and Policies</h2>
      <p>Check-in time: 4:00 PM</p>
      <p>Check-out time: 11:00 AM</p>
    </section>
    </body></html>
    """
    facts = extract_facts_from_page("https://hotel.com/our-hotel", html)
    assert facts["property.check_in.time"]["value"] == "4:00 PM"
    assert facts["property.check_out.time"]["value"] == "11:00 AM"


def test_normalize_prefers_higher_confidence_conflict():
    merged = normalize_facts(
        [
            {
                "property.check_in.time": {
                    "value": "3:00 PM",
                    "status": "filled",
                    "confidence": 0.7,
                    "extraction_method": "regex",
                    "source_url": "https://hotel.com/",
                }
            },
            {
                "property.check_in.time": {
                    "value": "4:00 PM",
                    "status": "filled",
                    "confidence": 0.95,
                    "extraction_method": "json_ld",
                    "source_url": "https://hotel.com/our-hotel",
                }
            },
        ]
    )
    fact = merged["property.check_in.time"]
    assert fact["value"] == "4:00 PM"
    assert fact["conflict_value"] == "3:00 PM"
    assert fact["status"] == "filled"


def test_clean_url_strips_query_and_trailing_slash():
    assert _clean_url("https://example.com/amenities/?utm_source=x#pool") == "https://example.com/amenities"


def test_select_urls_applies_faq_quota():
    scope = crawl_scope_from_seed("https://hotel.com")
    urls = {f"https://hotel.com/faq/category/question-{idx}" for idx in range(20)}
    urls.update(
        {
            "https://hotel.com/",
            "https://hotel.com/about-amenities",
            "https://hotel.com/dining",
            "https://hotel.com/contact-location",
        }
    )
    selected = _select_urls(urls, scope, max_pages=30)
    faq_urls = [url for url in selected if "/faq/" in url]
    assert len(faq_urls) <= 6
    assert "https://hotel.com/about-amenities" in selected


def test_collect_seed_urls_dedupes_and_normalizes():
    from app.knowledge.pipeline.crawl_scope import collect_seed_urls

    urls = collect_seed_urls(
        "www.hotel.com",
        ["https://www.hotel.com", "https://booking.com/hotel/example.html"],
    )
    assert urls == [
        "https://www.hotel.com",
        "https://booking.com/hotel/example.html",
    ]


def test_is_aggregator_url():
    from app.knowledge.pipeline.crawl_scope import is_aggregator_url

    assert is_aggregator_url("https://www.booking.com/hotel/example.html")
    assert is_aggregator_url("https://tripadvisor.com/Hotel_Review-g123")
    assert not is_aggregator_url("https://www.comfortinnedmonton.com/")


def test_discover_urls_from_seeds_assigns_budgets(monkeypatch):
    import asyncio

    from app.knowledge.pipeline.discover import discover_urls_from_seeds

    calls: list[tuple[str, int]] = []

    async def fake_discover(seed: str, *, max_pages: int = 30) -> list[str]:
        calls.append((seed, max_pages))
        return [seed]

    monkeypatch.setattr(
        "app.knowledge.pipeline.discover.discover_urls",
        fake_discover,
    )

    result = asyncio.run(
        discover_urls_from_seeds(
            [
                "https://hotel.com",
                "https://booking.com/hotel/example.html",
            ]
        )
    )
    assert result == [
        "https://hotel.com",
        "https://booking.com/hotel/example.html",
    ]
    assert calls[0] == ("https://hotel.com", 30)
    assert calls[1] == ("https://booking.com/hotel/example.html", 1)


def test_open_graph_description_extracts_check_in():
    html = """
    <html><head>
      <meta content="Comfort Inn Downtown Edmonton | Booking.com" property="og:title">
      <meta property="og:description" content="Check-in from 4:00 PM. Check-out until 11:00 AM. Free breakfast and indoor pool.">
    </head><body></body></html>
    """
    facts = extract_facts_from_page("https://www.booking.com/hotel/example.html", html)
    assert facts["property.name"]["value"] == "Comfort Inn Downtown Edmonton"
    assert facts["property.name"]["extraction_method"] == "open_graph"
    assert facts["property.check_in.time"]["value"] == "4:00 PM"
    assert facts["property.check_out.time"]["value"] == "11:00 AM"


def test_open_graph_meta_attribute_order():
    html = """
    <html><head>
      <meta content="Sandman Hotel Edmonton West" property="og:site_name">
    </head><body></body></html>
    """
    facts = extract_facts_from_page("https://example.com/", html)
    assert facts["property.name"]["value"] == "Sandman Hotel Edmonton West"


def test_seo_og_title_extracts_sandman_hotel_name():
    html = """
    <html><head>
      <meta property="og:title" content="Stay at the Best Hotel by West Edmonton Mall Sandman Hotel, Edmonton West">
    </head><body></body></html>
    """
    facts = extract_facts_from_page(
        "https://www.sandmanhotels.com/hotels/edmonton-west",
        html,
    )
    assert facts["property.name"]["value"] == "Sandman Hotel, Edmonton West"


def test_is_low_quality_property_name():
    from app.knowledge.pipeline.extract import is_low_quality_property_name

    assert is_low_quality_property_name(
        "Stay at the Best Hotel by West Edmonton Mall Sandman Hotel, Edmonton West"
    )
    assert not is_low_quality_property_name("Sandman Hotel Edmonton West")


def test_open_graph_address_tags():
    html = """
    <html><head>
      <meta property="og:street-address" content="10405 Jasper Avenue">
      <meta property="og:locality" content="Edmonton">
      <meta property="og:region" content="AB">
      <meta property="og:postal-code" content="T5J 3N8">
      <meta property="og:country-name" content="Canada">
    </head><body></body></html>
    """
    facts = extract_facts_from_page("https://example.com/", html)
    assert "10405 Jasper Avenue" in facts["property.location"]["value"]
    assert "Edmonton" in facts["property.location"]["value"]


_BOOKING_JINA_MARKDOWN = """
Title: Hyatt Place Edmonton West, Edmonton, Canada

URL Source: https://www.booking.com/hotel/ca/hyatt-place-edmonton-west.html

Markdown Content:
*   Pet friendly
*   Swimming pool
*   Free Wifi
*   Free parking
*   Daily housekeeping

## House rules

Check-in

From 3:00 PM

Check-out

Until 11:00 AM

Pets

Pets are allowed. Charges may apply.

## Amenities of Hyatt Place Edmonton West

### Most popular amenities

*   Indoor swimming pool
*   Free parking
*   Free Wifi
*   Fitness center
*   Restaurant
*   Bar
"""


def test_jina_markdown_extracts_booking_listing_facts():
    facts = extract_facts_from_page(
        "https://www.booking.com/hotel/ca/hyatt-place-edmonton-west.html",
        _BOOKING_JINA_MARKDOWN,
    )
    assert facts["property.name"]["value"] == "Hyatt Place Edmonton West"
    assert facts["property.name"]["extraction_method"] == "jina_markdown"
    assert facts["property.location"]["value"] == "Edmonton, Canada"
    assert facts["property.check_in.time"]["value"] == "3:00 PM"
    assert facts["property.check_out.time"]["value"] == "11:00 AM"
    assert facts["policies.pets.allowed"]["value"] is True
    assert facts["parking.self.available"]["value"] is True
    assert "Indoor swimming pool" in facts["property.amenities.summary"]["value"]
    assert facts["services.housekeeping.policy"]["value"] == "Daily housekeeping"


def test_jina_markdown_beats_regex_pet_fragment():
    facts = extract_facts_from_page(
        "https://www.booking.com/hotel/ca/hyatt-place-edmonton-west.html",
        _BOOKING_JINA_MARKDOWN,
    )
    assert facts["policies.pets.allowed"]["value"] is True
    assert facts["policies.pets.allowed"]["extraction_method"] == "jina_markdown"


def test_finalize_discovered_urls_keeps_seed_first():
    from app.knowledge.pipeline.discover import _finalize_discovered_urls

    scope = crawl_scope_from_seed("https://brand.com/hotels/downtown-edmonton")
    ordered = [
        "https://brand.com/hotels/downtown-edmonton",
        "https://brand.com/hotels/downtown-edmonton/amenities",
        "https://brand.com/hotels/downtown-edmonton/faq/item-1",
    ]
    result = _finalize_discovered_urls(ordered, scope, max_pages=2)
    assert result[0] == ordered[0]
    assert len(result) == 2


def test_discover_urls_seed_first_without_path_guessing(monkeypatch):
    import asyncio

    from app.knowledge.pipeline.discover import discover_urls

    fetch_calls: list[str] = []
    sitemap_called = {"value": False}

    async def fake_fetch_page(client, url, **kwargs):
        fetch_calls.append(url)

        class Res:
            status_code = 200
            final_url = url
            text = """
            <html><body>
            <a href="/hotels/downtown-edmonton/amenities">Amenities</a>
            </body></html>
            """
            method = "httpx"

        return Res()

    async def fake_sitemap(client, scope):
        sitemap_called["value"] = True
        return set()

    monkeypatch.setattr("app.knowledge.pipeline.discover.fetch_page", fake_fetch_page)
    monkeypatch.setattr("app.knowledge.pipeline.discover.crawl_throttle", lambda: asyncio.sleep(0))
    monkeypatch.setattr("app.knowledge.pipeline.discover._discover_from_sitemaps", fake_sitemap)

    result = asyncio.run(
        discover_urls("https://brand.com/hotels/downtown-edmonton", max_pages=10)
    )

    assert result[0] == "https://brand.com/hotels/downtown-edmonton"
    assert "https://brand.com/hotels/downtown-edmonton/amenities" in result
    assert sitemap_called["value"] is False
    assert len(fetch_calls) == 1
    assert fetch_calls[0] == "https://brand.com/hotels/downtown-edmonton"


def test_footer_contact_extracts_address_and_phone():
    html = """
    <html><body>
    <footer id="footer-content">
      <h3>Sandman Hotel Edmonton West</h3>
      <p>17635 Stony Plain Road, Edmonton, Alberta, T5S 1E3, CA</p>
      <a href="tel:+17804831385">(780) 483-1385</a>
    </footer>
    </body></html>
    """
    facts = extract_facts_from_page("https://www.sandmanhotels.com/edmonton-west", html)
    assert "17635 Stony Plain Road" in facts["property.location"]["value"]
    assert facts["property.location"]["extraction_method"] == "footer_contact"
    assert "483-1385" in facts["property.front_desk.phone"]["value"]


def test_jina_markdown_footer_extracts_street_address():
    markdown = """
Title: Sandman Hotel Edmonton West

URL Source: https://www.sandmanhotels.com/edmonton-west

Markdown Content:
Sandman Hotel Edmonton West

17635 Stony Plain Road,

 Edmonton, T5S 1E3

 Phone: [(780) 483-1385](tel:+17804831385)
"""
    facts = extract_facts_from_page("https://www.sandmanhotels.com/edmonton-west", markdown)
    assert "17635 Stony Plain Road" in facts["property.location"]["value"]
    assert "Edmonton" in facts["property.location"]["value"]
    assert "7804831385" in re.sub(r"\D", "", facts["property.front_desk.phone"]["value"])


def test_recaptcha_widget_not_treated_as_block_page():
    from app.knowledge.pipeline.crawl_http import is_blocked_or_challenge_html

    html = (
        "<html><body>" + ("x" * 6000)
        + '<div data-g-recaptcha-site-key="abc123"></div>'
        + ("y" * 6000)
        + "</body></html>"
    )
    assert not is_blocked_or_challenge_html(html)


def test_fetch_all_free_methods_collects_multiple_results():
    import asyncio
    from unittest.mock import patch

    from app.knowledge.pipeline.crawl_http import FetchResult, crawl_client, fetch_all_free_methods

    httpx_html = "<html><body>" + ("Hotel page " * 40) + "</body></html>"
    jina_text = (
        "Title: Example Hotel\n\nURL Source: https://example.com\n\n"
        "Markdown Content:\n## Contact\n17601 Example Road, Edmonton, AB\n"
        + ("detail " * 40)
    )

    async def fake_httpx(client, url):
        return FetchResult(200, url, httpx_html, "httpx")

    async def fake_playwright(url):
        return None

    async def fake_jina(url):
        return FetchResult(200, url, jina_text, "jina")

    async def fake_cache(url):
        return None

    async def fake_wayback(url):
        return None

    async def run():
        with patch("app.knowledge.pipeline.crawl_http.fetch_via_httpx", fake_httpx):
            with patch("app.knowledge.pipeline.crawl_http.fetch_via_playwright", fake_playwright):
                with patch("app.knowledge.pipeline.crawl_http.fetch_via_jina", fake_jina):
                    with patch("app.knowledge.pipeline.crawl_http.fetch_via_google_cache", fake_cache):
                        with patch("app.knowledge.pipeline.crawl_http.fetch_via_wayback", fake_wayback):
                            async with crawl_client() as client:
                                return await fetch_all_free_methods(client, "https://example.com/hotel")

    results = asyncio.run(run())
    methods = {res.method for res in results}
    assert methods == {"httpx", "jina"}


def test_boolean_pet_friendly_coerces_to_yes():
    facts = extract_facts_from_page(
        "https://example.com/",
        "<html><body>We are a pet-friendly hotel near the mall.</body></html>",
    )
    assert facts["policies.pets.allowed"]["value"] is True


def test_boolean_no_pets_coerces_to_no():
    facts = extract_facts_from_page(
        "https://example.com/",
        "<html><body>No pets allowed on property.</body></html>",
    )
    assert facts["policies.pets.allowed"]["value"] is False


def test_boolean_ambiguous_pet_text_not_filled():
    facts = extract_facts_from_page(
        "https://example.com/",
        "<html><body>Ask the front desk about animals.</body></html>",
    )
    assert "policies.pets.allowed" not in facts


def test_amenity_summary_extracts_boolean_slots():
    from app.knowledge.pipeline.extract import _extract_amenity_boolean_facts

    summary = (
        "Indoor swimming pool, Fitness center, Free overnight parking, "
        "$20 breakfast credit, Spa services"
    )
    facts = _extract_amenity_boolean_facts(summary)
    assert facts["amenities.pool.available"][0] is True
    assert facts["amenities.fitness.available"][0] is True
    assert facts["amenities.spa.available"][0] is True
    assert facts["dining.breakfast.available"][0] is True


def test_amenity_boolean_from_page_extract():
    html = """
    <html><body>
    <ul>
      <li>Indoor pool</li>
      <li>24-hour fitness center</li>
      <li>Hair dryer in every room</li>
    </ul>
    </body></html>
    """
    facts = extract_facts_from_page("https://example.com/", html)
    assert facts.get("amenities.pool.available", {}).get("value") is True
    assert facts.get("amenities.fitness.available", {}).get("value") is True
    assert facts.get("room.supplies.hair_dryer.available", {}).get("value") is True


def test_crawl_firecrawl_disabled_by_default(monkeypatch):
    monkeypatch.setenv("CRAWL_FIRECRAWL_ENABLED", "false")
    from app.core.config import Settings

    assert Settings().crawl_firecrawl_enabled is False
