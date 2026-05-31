"""Discover crawl targets from sitemap.xml (primary) with minimal fallback."""
from __future__ import annotations

import logging
import re
from typing import Set
from urllib.parse import urljoin, urlparse
from xml.etree import ElementTree

from app.knowledge.pipeline.crawl_http import crawl_client

logger = logging.getLogger(__name__)

_SKIP_EXTENSIONS = (
    ".pdf",
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".svg",
    ".zip",
    ".kml",
    ".mp4",
    ".mp3",
)

_SITEMAP_CANDIDATES = (
    "/sitemap.xml",
    "/sitemap_index.xml",
    "/sitemap-index.xml",
    "/sitemap/sitemap.xml",
)

_NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}


def _normalize_host(netloc: str) -> str:
    host = (netloc or "").lower()
    if host.startswith("www."):
        host = host[4:]
    return host


def _same_site(url: str, seed_netloc: str) -> bool:
    try:
        return _normalize_host(urlparse(url).netloc) == _normalize_host(seed_netloc)
    except Exception:
        return False


def _clean_url(url: str) -> str:
    return url.split("#")[0].strip()


def _is_crawlable_url(url: str) -> bool:
    path = urlparse(url).path.lower()
    return not any(path.endswith(ext) for ext in _SKIP_EXTENSIONS)


def _parse_locs_from_xml(text: str) -> tuple[list[str], list[str]]:
    """
    Return (page_urls, nested_sitemap_urls) from sitemap or sitemap index XML.
    Falls back to regex if XML parsing fails.
    """
    page_locs: list[str] = []
    sitemap_locs: list[str] = []
    try:
        root = ElementTree.fromstring(text)
        tag = root.tag.rsplit("}", 1)[-1].lower()
        if tag == "sitemapindex":
            for loc in root.findall(".//sm:sitemap/sm:loc", _NS):
                if loc.text:
                    sitemap_locs.append(loc.text.strip())
            for loc in root.findall(".//sitemap/loc"):
                if loc.text:
                    sitemap_locs.append(loc.text.strip())
        elif tag == "urlset":
            for loc in root.findall(".//sm:url/sm:loc", _NS):
                if loc.text:
                    page_locs.append(loc.text.strip())
            for loc in root.findall(".//url/loc"):
                if loc.text:
                    page_locs.append(loc.text.strip())
    except ElementTree.ParseError:
        for match in re.findall(r"<loc>([^<]+)</loc>", text, re.I):
            loc = match.strip()
            if "sitemap" in loc.lower() and loc.lower().endswith(".xml"):
                sitemap_locs.append(loc)
            else:
                page_locs.append(loc)
    return page_locs, sitemap_locs


async def _fetch_text(client, url: str) -> str | None:
    try:
        resp = await client.get(url)
        if resp.status_code != 200 or not resp.text:
            if resp.status_code in (403, 503):
                logger.warning("Blocked fetching %s (HTTP %s)", url, resp.status_code)
            return None
        if "Attention Required!" in resp.text and "Cloudflare" in resp.text:
            logger.warning("Cloudflare challenge when fetching %s", url)
            return None
        return resp.text
    except Exception as e:
        logger.debug("Fetch failed %s: %s", url, e)
    return None


async def _sitemap_urls_from_robots(client, base: str) -> list[str]:
    text = await _fetch_text(client, urljoin(base, "/robots.txt"))
    if not text:
        return []
    urls: list[str] = []
    for line in text.splitlines():
        if line.lower().startswith("sitemap:"):
            candidate = line.split(":", 1)[1].strip()
            if candidate:
                urls.append(candidate)
    return urls


async def _collect_from_sitemap(
    client,
    sitemap_url: str,
    seed_netloc: str,
    *,
    depth: int = 0,
    max_depth: int = 3,
) -> Set[str]:
    if depth > max_depth:
        return set()

    text = await _fetch_text(client, sitemap_url)
    if not text:
        return set()

    page_locs, nested = _parse_locs_from_xml(text)
    found: Set[str] = set()

    for loc in page_locs:
        url = _clean_url(loc)
        if _same_site(url, seed_netloc) and _is_crawlable_url(url):
            found.add(url)

    for nested_url in nested:
        nested_found = await _collect_from_sitemap(
            client,
            nested_url,
            seed_netloc,
            depth=depth + 1,
            max_depth=max_depth,
        )
        found.update(nested_found)

    return found


async def _discover_from_sitemaps(
    client,
    base: str,
    seed_netloc: str,
) -> Set[str]:
    candidates: list[str] = []
    seen: Set[str] = set()

    for path in _SITEMAP_CANDIDATES:
        url = urljoin(base, path)
        if url not in seen:
            seen.add(url)
            candidates.append(url)

    for url in await _sitemap_urls_from_robots(client, base):
        if url not in seen:
            seen.add(url)
            candidates.append(url)

    found: Set[str] = set()
    for sitemap_url in candidates:
        urls = await _collect_from_sitemap(client, sitemap_url, seed_netloc)
        if urls:
            logger.info("Sitemap %s yielded %d URLs", sitemap_url, len(urls))
            found.update(urls)
            if found:
                break

    return found


async def _fallback_seed_only(
    client,
    seed_url: str,
    seed_netloc: str,
) -> Set[str]:
    """If no sitemap, at least crawl the seed page."""
    found: Set[str] = set()
    try:
        resp = await client.get(seed_url)
        if resp.status_code < 400:
            final = _clean_url(str(resp.url))
            if _same_site(final, seed_netloc):
                found.add(final)
    except Exception as e:
        logger.debug("Seed fallback failed %s: %s", seed_url, e)
    return found


async def discover_urls(seed_url: str, *, max_pages: int = 30) -> list[str]:
    """Discover pages from sitemap.xml; fall back to seed URL only if sitemap is empty."""
    raw = (seed_url or "").strip()
    if "://" not in raw:
        raw = f"https://{raw}"
    parsed = urlparse(raw)
    base = f"{parsed.scheme}://{parsed.netloc}"

    async with crawl_client() as client:
        # Resolve redirects so sitemap host matches live site (www vs apex).
        resolved = base
        try:
            resp = await client.get(raw)
            if resp.status_code < 400:
                resolved = f"{urlparse(str(resp.url)).scheme}://{urlparse(str(resp.url)).netloc}"
        except Exception as e:
            logger.debug("Seed resolve failed %s: %s", raw, e)

        seed_netloc = urlparse(resolved).netloc
        found = await _discover_from_sitemaps(client, resolved, seed_netloc)

        if not found:
            logger.warning(
                "No sitemap URLs for %s — falling back to seed page only",
                resolved,
            )
            found = await _fallback_seed_only(client, raw, seed_netloc)

    urls = sorted(found)[:max_pages]
    logger.info("Discovered %d URLs from %s", len(urls), seed_url)
    return urls
