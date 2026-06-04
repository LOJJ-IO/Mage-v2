"""Discover crawl targets — seed URL(s) first, optional sitemap, no path guessing."""
from __future__ import annotations

import logging
import re
from typing import Set
from urllib.parse import urljoin, urlparse, urlunparse
from xml.etree import ElementTree

from app.core.config import get_settings
from app.knowledge.pipeline.crawl_http import (
    FetchFallback,
    crawl_client,
    crawl_throttle,
    fetch_page,
)
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
    parsed = parsed._replace(path=path, query="")
    return urlunparse(parsed)


def _is_crawlable_url(url: str) -> bool:
    path = urlparse(url).path.lower()
    if any(path.endswith(ext) for ext in _SKIP_EXTENSIONS):
        return False
    if any(snippet in path for snippet in _SKIP_PATH_SNIPPETS):
        return False
    return True


def _parse_urls_from_text(text: str) -> list[str]:
    """Extract http(s) URLs from plain text or markdown (e.g. Jina-rendered sitemap)."""
    return re.findall(r"https?://[^\s<>\"']+", text or "")


def _is_page_sitemap_url(url: str) -> bool:
    lower = url.lower()
    if "image" in lower and "sitemap" in lower:
        return False
    return lower.endswith(".xml") or "sitemap" in lower


def _sort_sitemap_candidates(urls: list[str]) -> list[str]:
    """Prefer standard sitemap.xml over image/other variants."""

    def rank(u: str) -> tuple[int, str]:
        path = urlparse(u).path.lower()
        if path.endswith("/sitemap.xml") or path == "/sitemap.xml":
            return (0, u)
        if "sitemap_index" in path or "sitemap-index" in path:
            return (1, u)
        if "image" in path:
            return (9, u)
        return (2, u)

    return sorted(dict.fromkeys(urls), key=rank)


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


async def _fetch_text(
    client,
    url: str,
    *,
    fallback: FetchFallback = "direct",
) -> str | None:
    """Lightweight fetch for discovery probes (no paid fallbacks by default)."""
    try:
        await crawl_throttle()
        res = await fetch_page(client, url, fallback=fallback)
        if res.status_code != 200 or not res.text:
            logger.debug(
                "Fetch not usable for %s (status=%s, method=%s, chars=%d)",
                url,
                res.status_code,
                res.method,
                len(res.text or ""),
            )
            return None
        if res.method not in ("httpx", "httpx_googlebot", "httpx_browser"):
            logger.info("Fallback fetch via %s succeeded for %s", res.method, url)
        return res.text
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
            if candidate and _is_page_sitemap_url(candidate):
                urls.append(candidate)
    return _sort_sitemap_candidates(urls)


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
    max_depth: int = 2,
) -> Set[str]:
    if depth > max_depth:
        return set()

    text = await _fetch_text(client, sitemap_url)
    if not text:
        return set()

    seed_netloc = urlparse(scope.seed_url).netloc
    page_locs, nested = _parse_locs_from_xml(text)
    if not page_locs and not nested:
        for raw_url in _parse_urls_from_text(text):
            cleaned = _clean_url(raw_url)
            if cleaned.lower().endswith(".xml") and "sitemap" in cleaned.lower():
                nested.append(cleaned)
            elif _same_site(cleaned, seed_netloc):
                page_locs.append(cleaned)

    found: Set[str] = set()

    for loc in page_locs:
        url = _clean_url(loc)
        if _same_site(url, seed_netloc) and url_under_scope(url, scope):
            found.add(url)

    for nested_url in nested:
        if scope.is_scoped and not url_under_scope(nested_url, scope):
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
    """Optional expansion — one sitemap fetch at a time with throttling."""
    base = f"{urlparse(scope.seed_url).scheme}://{urlparse(scope.seed_url).netloc}"
    candidates = _sort_sitemap_candidates(_sitemap_candidates_for_scope(scope))
    for url in await _sitemap_urls_from_robots(client, base):
        if url not in candidates:
            candidates.insert(0, url)

    found: Set[str] = set()
    for sitemap_url in candidates:
        urls = await _collect_from_sitemap(client, sitemap_url, scope)
        if urls:
            logger.info("Sitemap %s yielded %d scoped URLs", sitemap_url, len(urls))
            found.update(urls)
            break

    return found


def _links_from_html(html: str, base_url: str, scope: CrawlScope) -> list[str]:
    seed_netloc = urlparse(base_url).netloc
    found: list[str] = []
    seen: set[str] = set()
    for href in re.findall(r'href=["\']([^"\']+)["\']', html, re.I):
        full = _clean_url(urljoin(base_url, href))
        if full in seen:
            continue
        if (
            _same_site(full, seed_netloc)
            and url_under_scope(full, scope)
            and _is_crawlable_url(full)
        ):
            seen.add(full)
            found.append(full)
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


def _finalize_discovered_urls(ordered: list[str], scope: CrawlScope, max_pages: int) -> list[str]:
    """Keep the seed first; apply quotas only to additional URLs."""
    if not ordered:
        return []
    seed = ordered[0]
    rest = ordered[1:]
    if not rest or max_pages <= 1:
        return [seed][:max_pages]

    picked = set(_select_urls(set(rest), scope, max(0, max_pages - 1)))
    rest_ordered = [url for url in rest if url in picked]
    return [seed, *rest_ordered[: max_pages - 1]]


async def _discover_single_page(client, raw: str) -> list[str]:
    """Resolve redirects and return only the listing page (OTAs, review sites)."""
    try:
        await crawl_throttle()
        res = await fetch_page(client, raw, fallback="free")
        if res.status_code == 200 and res.text:
            return [_clean_url(res.final_url)]
    except Exception as e:
        logger.debug("Single-page resolve failed %s: %s", raw, e)
    cleaned = _clean_url(normalize_seed_url(raw))
    return [cleaned] if cleaned else []


async def discover_urls(seed_url: str, *, max_pages: int = 30) -> list[str]:
    """
    Discover crawl targets for one seed.

    Always includes the pasted URL first. Optionally adds same-property links from
    that page (one fetch). Sitemap expansion is off unless CRAWL_DISCOVER_SITEMAP=true.
    No guessed /amenities /faqs paths.
    """
    raw = normalize_seed_url(seed_url)
    if not raw:
        return []

    if is_aggregator_url(raw):
        async with crawl_client(timeout=_PROBE_TIMEOUT) as client:
            urls = await _discover_single_page(client, raw)
        logger.info("Aggregator seed %s — single page only", raw)
        return urls[:max_pages]

    scope = crawl_scope_from_seed(raw)
    ordered: list[str] = [_clean_url(raw)]
    seen: set[str] = set(ordered)

    settings = get_settings()
    async with crawl_client(timeout=_PROBE_TIMEOUT) as client:
        await crawl_throttle()
        res = await fetch_page(client, raw, fallback="free")
        if res.status_code == 200 and res.text:
            resolved = _clean_url(res.final_url)
            if resolved != ordered[0]:
                seen.discard(ordered[0])
                ordered[0] = resolved
                seen.add(resolved)
                scope = crawl_scope_from_seed(raw, resolved_url=resolved)

            for link in _links_from_html(res.text, resolved, scope):
                if link in seen:
                    continue
                seen.add(link)
                ordered.append(link)
                if len(ordered) >= max_pages:
                    break
            logger.info(
                "Seed page %s yielded %d in-scope link(s)",
                resolved,
                max(0, len(ordered) - 1),
            )
        else:
            logger.info(
                "Seed page fetch failed during discover — will still crawl %s",
                ordered[0],
            )

        if settings.crawl_discover_sitemap and len(ordered) < max_pages:
            sitemap_urls = _filter_for_scope(
                await _discover_from_sitemaps(client, scope),
                scope,
            )
            for url in prioritize_scoped_urls(sorted(sitemap_urls), scope):
                if url in seen:
                    continue
                seen.add(url)
                ordered.append(url)
                if len(ordered) >= max_pages:
                    break

    urls = _finalize_discovered_urls(ordered, scope, max_pages)
    logger.info(
        "Discovered %d URLs from %s (scope=%s, sitemap=%s)",
        len(urls),
        seed_url,
        scope.path_prefix or "whole-domain",
        settings.crawl_discover_sitemap,
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
