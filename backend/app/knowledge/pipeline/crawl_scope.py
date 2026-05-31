"""Scope hotel crawls to a path prefix when the site is shared across properties."""
from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urlparse

# Last path segment names that are pages, not the hotel root.
_PAGE_SEGMENTS = frozenset(
    {
        "amenities",
        "about-amenities",
        "dining",
        "restaurant",
        "breakfast",
        "faq",
        "faqs",
        "pool",
        "fitness",
        "gym",
        "parking",
        "policies",
        "contact",
        "contact-us",
        "contact-location",
        "location",
        "directions",
        "overview",
        "gallery",
        "photos",
        "rooms",
        "suites",
        "rates",
        "offers",
        "specials",
        "accessibility",
        "events",
        "meetings",
        "weddings",
        "spa",
        "bar",
        "lounge",
    }
)

_GENERIC_PATH_SEGMENTS = frozenset({"en", "en-us", "en-gb", "fr", "de", "es", "hotels", "hotel", "properties"})


@dataclass(frozen=True)
class CrawlScope:
    seed_url: str
    path_prefix: str  # "" = whole domain; else e.g. /marriott/hotels/yowcy-ottawa
    property_slug: str
    display_name: str

    @property
    def is_scoped(self) -> bool:
        return bool(self.path_prefix)


def normalize_seed_url(raw: str) -> str:
    text = (raw or "").strip()
    if not text:
        return ""
    if "://" not in text:
        text = f"https://{text}"
    return text


def _normalize_host(netloc: str) -> str:
    host = (netloc or "").lower()
    if host.startswith("www."):
        host = host[4:]
    return host


def _slugify(*parts: str) -> str:
    out: list[str] = []
    for part in parts:
        slug = re.sub(r"[^a-z0-9]+", "-", (part or "").lower()).strip("-")
        if slug:
            out.append(slug)
    return "-".join(out)


def path_prefix_from_url(url: str) -> str:
    """
    Derive the hotel root path from a pasted URL.

    https://brand.com/hotels/downtown/faq → /hotels/downtown
    https://hotel.com/ → "" (whole domain)
    """
    parsed = urlparse(normalize_seed_url(url))
    segments = [s for s in parsed.path.split("/") if s]
    if not segments:
        return ""

    if segments[-1].lower() in _PAGE_SEGMENTS:
        segments = segments[:-1]

    # Drop trailing locale-only tails like /en-us with nothing after.
    while len(segments) == 1 and segments[0].lower() in _GENERIC_PATH_SEGMENTS:
        return ""

    if not segments:
        return ""

    return "/" + "/".join(segments)


def property_id_from_url(seed_url: str) -> str:
    """Stable id from host + hotel path (supports brand sub-routes)."""
    parsed = urlparse(normalize_seed_url(seed_url))
    host = _normalize_host(parsed.netloc)
    prefix = path_prefix_from_url(seed_url)

    host_slug = _slugify(host.replace(".", "-"))
    if prefix:
        path_slug = _slugify(*prefix.strip("/").split("/"))
        slug = _slugify(host_slug, path_slug)
    else:
        slug = host_slug

    return (slug[:64] or "pilot-hotel")


def display_name_from_url(seed_url: str, property_id: str) -> str:
    prefix = path_prefix_from_url(seed_url)
    if prefix:
        segments = [s for s in prefix.split("/") if s]
        # Prefer last non-generic segment for the hotel name.
        for seg in reversed(segments):
            if seg.lower() not in _GENERIC_PATH_SEGMENTS and len(seg) > 2:
                return seg.replace("-", " ").replace("_", " ").title()
    parsed = urlparse(normalize_seed_url(seed_url))
    host = _normalize_host(parsed.netloc)
    if host:
        base = host.split(".")[0].replace("-", " ").replace("_", " ")
        if base:
            return base.title()
    return property_id.replace("-", " ").title()


def crawl_scope_from_seed(seed_url: str, *, resolved_url: str | None = None) -> CrawlScope:
    seed = normalize_seed_url(seed_url)
    final = normalize_seed_url(resolved_url or seed_url)
    prefix = path_prefix_from_url(final)
    prop_id = property_id_from_url(final)
    return CrawlScope(
        seed_url=final,
        path_prefix=prefix,
        property_slug=prop_id,
        display_name=display_name_from_url(final, prop_id),
    )


def url_under_scope(url: str, scope: CrawlScope) -> bool:
    """True when url belongs to this property (same host + under path prefix)."""
    parsed = urlparse(url)
    seed_parsed = urlparse(scope.seed_url)
    if _normalize_host(parsed.netloc) != _normalize_host(seed_parsed.netloc):
        return False
    if not scope.path_prefix:
        return True

    path = (parsed.path or "/").rstrip("/") or "/"
    prefix = scope.path_prefix.rstrip("/")
    return path == prefix or path.startswith(prefix + "/")


def prioritize_scoped_urls(urls: list[str], scope: CrawlScope) -> list[str]:
    """Hotel-relevant pages first, deprioritize other properties' FAQ slugs."""
    if not scope.is_scoped:
        return urls

    prefix = scope.path_prefix.rstrip("/")

    def rank(url: str) -> tuple[int, str]:
        path = urlparse(url).path.lower()
        score = 0
        if path == prefix or path == prefix + "/":
            score += 100
        if any(seg in path for seg in ("/amenit", "/dining", "/faq", "/pool", "/parking", "/contact")):
            score += 50
        if "/faq/" in path and prefix not in path:
            score -= 30
        return (-score, url)

    return sorted(urls, key=rank)
