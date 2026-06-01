"""Discover crawl targets from sitemap.xml (primary) with minimal fallback."""
from __future__ import annotations

import asyncio
import logging
import re
from typing import Set
from urllib.parse import urljoin, urlparse, urlunparse
from xml.etree import ElementTree

from app.knowledge.pipeline.crawl_http import crawl_client
from app.knowledge.pipeline.crawl_scope import (
    CrawlScope,
    crawl_scope_from_seed,
    is_aggregator_url,
    normalize_seed_url,
    prioritize_scoped_urls,
    url_under_scope,
)

logger = logging.getLogger(__name__)

_PROBE_TIMEOUT = 8.0
_MIN_SCOPED_URLS = 5

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
    ".ico",
)

_SKIP_PATH_SNIPPETS = (
    "/tracking/",
    "/images/",
    "/css/",
    "/scripts/",
    "/cdn-cgi/",
    "click-reservation",
    "print.aspx",
    "/amp",
)

_SITEMAP_CANDIDATES = (
    "/sitemap.xml",
    "/sitemap_index.xml",
    "/sitemap-index.xml",
    "/sitemap/sitemap.xml",
)

# Brand sites often use these instead of /amenities, /faq, etc.
_SCOPED_PATH_SUFFIXES = (
    "/overview",
    "/amenities",
    "/amenities-and-services",
    "/hotel-amenities",
    "/dining",
    "/restaurants",
    "/faq",
    "/faqs",
    "/policies",
    "/location",
    "/contact",
    "/rooms",
    "/gallery",
)

_PAGE_QUOTAS = {
    "core": 4,
    "amenities": 5,
    "dining": 3,
    "rooms": 4,
    "policies": 3,
    "contact": 2,
    "faq": 6,
    "offers": 2,
    "general": 8,
}

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
    parsed = urlparse(url.split("#")[0].strip())
    path = parsed.path or "/"
    if path != "/" and path.endswith("/"):
        path = path.rstrip("/")
    # Drop querystrings for crawl targets to avoid duplicate variants.
    parsed = parsed._replace(path=path, query="")
    return urlunparse(parsed)


def _is_crawlable_url(url: str) -> bool:
    path = urlparse(url).path.lower()
    if any(path.endswith(ext) for ext in _SKIP_EXTENSIONS):
        return False
    if any(snippet in path for snippet in _SKIP_PATH_SNIPPETS):
        return False
    return True


def _parse_locs_from_xml(text: str) -> tuple[list[str], list[str]]:
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


def _filter_for_scope(urls: Set[str], scope: CrawlScope) -> Set[str]:
    filtered = {u for u in urls if _is_crawlable_url(u) and url_under_scope(u, scope)}
    if scope.is_scoped and len(filtered) < len(urls):
        logger.info(
            "Scoped crawl %s: kept %d/%d URLs under %s",
            scope.property_slug,
            len(filtered),
            len(urls),
            scope.path_prefix,
        )
    return filtered


async def _collect_from_sitemap(
    client,
    sitemap_url: str,
    scope: CrawlScope,
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
    seed_netloc = urlparse(scope.seed_url).netloc

    for loc in page_locs:
        url = _clean_url(loc)
        if _same_site(url, seed_netloc) and url_under_scope(url, scope):
            found.add(url)

    for nested_url in nested:
        if scope.is_scoped and not url_under_scope(nested_url, scope):
            # Skip sitemaps for other hotels on the same domain.
            if scope.path_prefix not in urlparse(nested_url).path:
                continue
        nested_found = await _collect_from_sitemap(
            client,
            nested_url,
            scope,
            depth=depth + 1,
            max_depth=max_depth,
        )
        found.update(nested_found)

    return found


def _sitemap_candidates_for_scope(scope: CrawlScope) -> list[str]:
    parsed = urlparse(scope.seed_url)
    base = f"{parsed.scheme}://{parsed.netloc}"
    candidates: list[str] = []
    seen: Set[str] = set()

    if scope.path_prefix:
        prefix = scope.path_prefix.rstrip("/")
        for name in ("sitemap.xml", "sitemap_index.xml"):
            url = urljoin(base, f"{prefix}/{name}")
            if url not in seen:
                seen.add(url)
                candidates.append(url)

    for path in _SITEMAP_CANDIDATES:
        url = urljoin(base, path)
        if url not in seen:
            seen.add(url)
            candidates.append(url)

    return candidates


async def _discover_from_sitemaps(client, scope: CrawlScope) -> Set[str]:
    candidates = _sitemap_candidates_for_scope(scope)
    for url in await _sitemap_urls_from_robots(
        client, f"{urlparse(scope.seed_url).scheme}://{urlparse(scope.seed_url).netloc}"
    ):
        if url not in candidates:
            candidates.insert(0, url)

    found: Set[str] = set()
    for sitemap_url in candidates:
        if scope.is_scoped and len(found) >= _MIN_SCOPED_URLS:
            break
        urls = await _collect_from_sitemap(client, sitemap_url, scope)
        if urls:
            logger.info("Sitemap %s yielded %d scoped URLs", sitemap_url, len(urls))
            found.update(urls)

    return found


async def _url_exists(client, url: str) -> str | None:
    """Return canonical URL if page exists; use GET (many sites reject HEAD)."""
    try:
        resp = await client.get(url, timeout=_PROBE_TIMEOUT)
        if resp.status_code < 400:
            return _clean_url(str(resp.url))
    except Exception:
        pass
    return None


async def _discover_scoped_path_guesses(client, scope: CrawlScope) -> Set[str]:
    """Try a few likely subpages in parallel — only when sitemap/links found almost nothing."""
    if not scope.path_prefix:
        return set()

    parsed = urlparse(scope.seed_url)
    base = f"{parsed.scheme}://{parsed.netloc}"
    prefix = scope.path_prefix.rstrip("/")
    candidates = [urljoin(base, prefix + suffix) for suffix in _SCOPED_PATH_SUFFIXES]

    results = await asyncio.gather(*(_url_exists(client, url) for url in candidates))
    return {u for u in results if u}


async def _discover_from_seed_links(client, scope: CrawlScope) -> Set[str]:
    """Pull same-property links from the seed page."""
    found: Set[str] = set()
    html = await _fetch_text(client, scope.seed_url)
    if not html:
        return found

    found.add(_clean_url(scope.seed_url))
    seed_netloc = urlparse(scope.seed_url).netloc
    for href in re.findall(r'href=["\']([^"\']+)["\']', html, re.I):
        full = _clean_url(urljoin(scope.seed_url, href))
        if _same_site(full, seed_netloc) and url_under_scope(full, scope) and _is_crawlable_url(full):
            found.add(full)

    return found


def _rank_url(url: str, scope: CrawlScope) -> int:
    path = (urlparse(url).path or "/").lower()
    score = 0
    if path == "/" or path == scope.path_prefix.rstrip("/"):
        score += 120
    if any(
        token in path
        for token in (
            "our-hotel",
            "overview",
            "about",
            "amenit",
            "dining",
            "contact",
            "location",
            "rooms",
            "services",
            "polic",
        )
    ):
        score += 80
    if any(token in path for token in ("faq", "covid-19-faq", "lorem-ipsum")):
        score -= 40
    if path.count("/") <= 2:
        score += 20
    if "faq/" in path and path.count("/") >= 4:
        score -= 30
    if any(token in path for token in ("privacy", "legal", "cookie", "accessibility", "ada-website")):
        score -= 70
    return score


def _classify_url(url: str) -> str:
    path = (urlparse(url).path or "/").lower()
    if path in ("", "/") or path.endswith("/overview") or "our-hotel" in path:
        return "core"
    if any(token in path for token in ("amenit", "facilities", "pool", "fitness", "gym", "spa")):
        return "amenities"
    if any(token in path for token in ("dining", "restaurant", "bar", "breakfast")):
        return "dining"
    if any(token in path for token in ("rooms", "suites", "accommodation")):
        return "rooms"
    if any(token in path for token in ("polic", "check-in", "check-out", "terms")):
        return "policies"
    if any(token in path for token in ("contact", "location", "directions")):
        return "contact"
    if any(token in path for token in ("faq", "help")):
        return "faq"
    if any(token in path for token in ("offers", "deals", "rates", "book")):
        return "offers"
    return "general"


def _select_urls(urls: Set[str], scope: CrawlScope, max_pages: int) -> list[str]:
    ordered = prioritize_scoped_urls(sorted(urls), scope)
    ranked = sorted(ordered, key=lambda u: (-_rank_url(u, scope), u))
    selected: list[str] = []
    counts: dict[str, int] = {}
    for url in ranked:
        page_type = _classify_url(url)
        if counts.get(page_type, 0) >= _PAGE_QUOTAS.get(page_type, _PAGE_QUOTAS["general"]):
            continue
        counts[page_type] = counts.get(page_type, 0) + 1
        selected.append(url)
        if len(selected) >= max_pages:
            break
    return selected


async def _fallback_seed_only(client, scope: CrawlScope) -> Set[str]:
    found: Set[str] = set()
    try:
        resp = await client.get(scope.seed_url)
        if resp.status_code < 400:
            final = _clean_url(str(resp.url))
            if url_under_scope(final, scope):
                found.add(final)
    except Exception as e:
        logger.debug("Seed fallback failed %s: %s", scope.seed_url, e)
    return found


async def _discover_single_page(client, raw: str) -> list[str]:
    """Resolve redirects and return only the listing page (OTAs, review sites)."""
    try:
        resp = await client.get(raw)
        if resp.status_code < 400:
            return [_clean_url(str(resp.url))]
    except Exception as e:
        logger.debug("Single-page resolve failed %s: %s", raw, e)
    cleaned = _clean_url(normalize_seed_url(raw))
    return [cleaned] if cleaned else []


async def discover_urls(seed_url: str, *, max_pages: int = 30) -> list[str]:
    """Discover pages from sitemap, scoped to the hotel path when applicable."""
    raw = normalize_seed_url(seed_url)
    if not raw:
        return []

    if is_aggregator_url(raw):
        async with crawl_client(timeout=_PROBE_TIMEOUT) as client:
            urls = await _discover_single_page(client, raw)
        logger.info("Aggregator seed %s — single page only", raw)
        return urls[:max_pages]

    async with crawl_client(timeout=_PROBE_TIMEOUT) as client:
        resolved = raw
        try:
            resp = await client.get(raw)
            if resp.status_code < 400:
                resolved = _clean_url(str(resp.url))
        except Exception as e:
            logger.debug("Seed resolve failed %s: %s", raw, e)

        scope = crawl_scope_from_seed(raw, resolved_url=resolved)
        logger.info("Discovering URLs for scope=%s", scope.path_prefix or "whole-domain")

        # For brand sub-routes, homepage links are often faster/more accurate than domain sitemap.
        if scope.is_scoped:
            found = await _discover_from_seed_links(client, scope)
            if len(found) < _MIN_SCOPED_URLS:
                found.update(await _discover_from_sitemaps(client, scope))
            if len(found) < 3:
                logger.info("Few URLs from sitemap/links — trying scoped path guesses")
                found.update(await _discover_scoped_path_guesses(client, scope))
            found = _filter_for_scope(found, scope)
        else:
            found = await _discover_from_sitemaps(client, scope)
            found.update(await _discover_from_seed_links(client, scope))
            if not found:
                logger.warning("No sitemap URLs for %s — falling back to seed page only", resolved)
                found = await _fallback_seed_only(client, scope)
            else:
                found = _filter_for_scope(found, scope)

        if not found:
            found = await _fallback_seed_only(client, scope)

    urls = _select_urls(found, scope, max_pages)
    logger.info(
        "Discovered %d URLs from %s (scope=%s)",
        len(urls),
        seed_url,
        scope.path_prefix or "whole-domain",
    )
    return urls


async def discover_urls_from_seeds(
    seed_urls: list[str],
    *,
    max_pages: int = 40,
) -> list[str]:
    """Discover crawl targets from one or more seed URLs (hotel site + OTA listings)."""
    seeds = [normalize_seed_url(u) for u in seed_urls if normalize_seed_url(u)]
    if not seeds:
        return []

    primary_host = urlparse(seeds[0]).netloc
    merged: list[str] = []
    seen: set[str] = set()

    for idx, seed in enumerate(seeds):
        remaining = max_pages - len(merged)
        if remaining <= 0:
            break

        is_primary = idx == 0
        seed_host = urlparse(seed).netloc
        same_site = _normalize_host(seed_host) == _normalize_host(primary_host)

        if is_aggregator_url(seed):
            budget = 1
        elif is_primary:
            budget = min(30, remaining)
        elif same_site:
            budget = min(10, remaining)
        else:
            budget = min(3, remaining)

        found = await discover_urls(seed, max_pages=budget)
        for url in found:
            if url not in seen:
                seen.add(url)
                merged.append(url)
            if len(merged) >= max_pages:
                break

    logger.info(
        "Discovered %d URLs from %d seed(s)",
        len(merged),
        len(seeds),
    )
    return merged[:max_pages]


def _normalize_host(netloc: str) -> str:
    host = (netloc or "").lower()
    if host.startswith("www."):
        host = host[4:]
    return host
