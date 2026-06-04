"""Tests for Firecrawl paid fallback in crawl_http."""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from app.knowledge.pipeline.crawl_http import (
    _wrap_jina_reader_markdown,
    crawl_client,
    fetch_page,
    fetch_via_firecrawl,
)


def test_wrap_jina_reader_markdown():
    wrapped = _wrap_jina_reader_markdown(
        "https://example.com/hotel",
        "## House rules\n\nCheck-in\n\nFrom 3:00 PM",
        title="Example Hotel, Edmonton, Canada",
    )
    assert wrapped.startswith("Title: Example Hotel, Edmonton, Canada")
    assert "URL Source: https://example.com/hotel" in wrapped
    assert "Markdown Content:" in wrapped
    assert "3:00 PM" in wrapped


def test_firecrawl_skipped_without_api_key():
    async def run():
        with patch("app.knowledge.pipeline.crawl_http.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
                firecrawl_api_key="",
                crawl_firecrawl_enabled=True,
            )
            return await fetch_via_firecrawl("https://example.com")

    assert asyncio.run(run()) is None


def test_firecrawl_wraps_markdown_response():
    async def run():
        api_response = {
            "success": True,
            "data": {
                "markdown": "## Amenities\n\n* Pool\n* Free parking\n" * 20,
                "metadata": {"title": "Test Hotel, Edmonton, Canada"},
            },
        }

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = api_response

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_resp
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None

        with patch("app.knowledge.pipeline.crawl_http.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
                firecrawl_api_key="fc-test-key",
                crawl_firecrawl_enabled=True,
            )
            with patch("app.knowledge.pipeline.crawl_http.httpx.AsyncClient", return_value=mock_client):
                return await fetch_via_firecrawl("https://www.hyatt.com/hotel")

    result = asyncio.run(run())
    assert result is not None
    assert result.method == "firecrawl"
    assert result.status_code == 200
    assert "Title: Test Hotel, Edmonton, Canada" in result.text
    assert "Markdown Content:" in result.text


def test_fetch_page_uses_firecrawl_after_free_methods_fail():
    """Firecrawl runs only after httpx/jina/cache/wayback fail."""
    call_order: list[str] = []

    async def fake_httpx(client, url):
        call_order.append("httpx")
        return None

    async def fake_playwright(url):
        call_order.append("playwright")
        return None

    async def fake_jina(url):
        call_order.append("jina")
        return None

    async def fake_cache(url):
        call_order.append("google_cache")
        return None

    async def fake_wayback(url):
        call_order.append("wayback")
        return None

    async def fake_firecrawl(url):
        call_order.append("firecrawl")
        from app.knowledge.pipeline.crawl_http import FetchResult

        text = _wrap_jina_reader_markdown(url, "x" * 300, title="Hotel")
        return FetchResult(200, url, text, "firecrawl")

    async def run():
        with patch("app.knowledge.pipeline.crawl_http.fetch_via_httpx", fake_httpx):
            with patch("app.knowledge.pipeline.crawl_http.fetch_via_playwright", fake_playwright):
                with patch("app.knowledge.pipeline.crawl_http.fetch_via_jina", fake_jina):
                    with patch("app.knowledge.pipeline.crawl_http.fetch_via_google_cache", fake_cache):
                        with patch("app.knowledge.pipeline.crawl_http.fetch_via_wayback", fake_wayback):
                            with patch("app.knowledge.pipeline.crawl_http.fetch_via_firecrawl", fake_firecrawl):
                                async with crawl_client() as client:
                                    return await fetch_page(client, "https://blocked.example.com")

    res = asyncio.run(run())
    assert call_order == ["httpx", "playwright", "jina", "google_cache", "wayback", "firecrawl"]
    assert res.method == "firecrawl"
    assert not res.blocked
