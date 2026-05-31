"""Discover URLs from sitemap and homepage links."""
from __future__ import annotations

import logging
import re
from typing import Set
from urllib.parse import urljoin, urlparse

import httpx

logger = logging.getLogger(__name__)

_PATH_PROBES = (
    "/",
    "/amenities",
    "/pool",
    "/fitness",
    "/dining",
    "/restaurant",
    "/faq",
    "/faq/",
    "/policies",
    "/parking",
)


async def discover_urls(seed_url: str, *, max_pages: int = 30) -> list[str]:
    """Crawl sitemap + homepage + common path probes."""
    parsed = urlparse(seed_url)
    base = f"{parsed.scheme}://{parsed.netloc}"
    found: Set[str] = set()

    async with httpx.AsyncClient(follow_redirects=True, timeout=15.0) as client:
        for path in _PATH_PROBES:
            url = urljoin(base, path)
            try:
                resp = await client.head(url)
                if resp.status_code < 400:
                    found.add(str(resp.url).split("#")[0])
            except Exception:
                pass

        sitemap_url = urljoin(base, "/sitemap.xml")
        try:
            resp = await client.get(sitemap_url)
            if resp.status_code == 200:
                for match in re.findall(r"<loc>([^<]+)</loc>", resp.text):
                    if parsed.netloc in match:
                        found.add(match.split("#")[0])
        except Exception as e:
            logger.debug("Sitemap fetch failed: %s", e)

        try:
            resp = await client.get(seed_url)
            if resp.status_code == 200:
                for href in re.findall(r'href=["\']([^"\']+)["\']', resp.text, re.I):
                    full = urljoin(str(resp.url), href)
                    if parsed.netloc in full and not full.endswith((".pdf", ".jpg", ".png")):
                        found.add(full.split("#")[0])
        except Exception as e:
            logger.warning("Homepage crawl failed: %s", e)

    urls = sorted(found)[:max_pages]
    logger.info("Discovered %d URLs from %s", len(urls), seed_url)
    return urls
