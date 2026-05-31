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
