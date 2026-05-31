"""Shared HTTP client settings for hotel website crawls."""
from __future__ import annotations

import httpx

# Many hotel sites sit behind Cloudflare and block generic Python clients.
CRAWL_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Accept": "application/xml,text/xml,text/html,*/*",
}


def crawl_client(**kwargs: object) -> httpx.AsyncClient:
    kwargs.setdefault("timeout", 20.0)
    return httpx.AsyncClient(
        follow_redirects=True,
        headers=CRAWL_HEADERS,
        **kwargs,
    )
