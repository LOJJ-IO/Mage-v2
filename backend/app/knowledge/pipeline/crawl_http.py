"""Shared HTTP fetch settings and multi-service fallback for hotel website crawls."""
from __future__ import annotations

import asyncio
import logging
import random
import re
from dataclasses import dataclass
from typing import Awaitable, Callable, Literal, Optional

FetchFallback = Literal["direct", "free", "full"]
from urllib.parse import quote

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_MIN_USABLE_CHARS = 200
_FETCH_TIMEOUT = 25.0
_FIRECRAWL_TIMEOUT = 60.0
_FIRECRAWL_API_URL = "https://api.firecrawl.dev/v2/scrape"

# ── User agents ────────────────────────────────────────────────────────────────

_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
]


_GOOGLEBOT_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"


def _random_ua() -> str:
    return random.choice(_USER_AGENTS)


def _simple_headers(ua: Optional[str] = None) -> dict[str, str]:
    """Minimal headers — works on many independent hotel sites (Comfort Inn, etc.)."""
    return {
        "User-Agent": ua or _random_ua(),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }


def _googlebot_headers() -> dict[str, str]:
    """Googlebot UA — many small hotel sites allow this but block browser fingerprints."""
    return {
        "User-Agent": _GOOGLEBOT_UA,
        "Accept": "application/xml,text/xml,text/html,*/*",
    }


def _browser_headers(ua: Optional[str] = None) -> dict[str, str]:
    """Browser-like headers for direct httpx fetches."""
    return {
        "User-Agent": ua or _random_ua(),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Sec-CH-UA": '"Chromium";v="125", "Google Chrome";v="125", "Not-A.Brand";v="99"',
        "Sec-CH-UA-Mobile": "?0",
        "Sec-CH-UA-Platform": '"Windows"',
        "DNT": "1",
        "Cache-Control": "max-age=0",
    }


# Default crawl client: simple headers (not full Sec-Fetch set — triggers WAF on some sites)
CRAWL_HEADERS = _simple_headers()


# ── Result dataclass ───────────────────────────────────────────────────────────

@dataclass
class FetchResult:
    status_code: Optional[int]
    final_url: str
    text: str
    method: str
    blocked: bool = False
    blocked_reason: str = ""


# ── Block detection ────────────────────────────────────────────────────────────

_BLOCK_MARKERS = (
    "attention required",
    "cloudflare",
    "cf-chl-",
    "challenge-platform",
    "awswaf",
    "aws waf",
    "enable javascript and cookies",
    "just a moment",
    "request blocked",
    "bot verification",
    "access denied",
    "ddos protection",
    "security check",
    "please wait while we check",
    "browser check",
    "verify you are human",
    "complete the captcha",
)

# Embedded reCAPTCHA widgets on real hotel pages are not bot-challenge pages.
_RECAPTCHA_WIDGET_MARKERS = (
    "g-recaptcha",
    "recaptcha-site-key",
    "google.com/recaptcha",
)

# Jina wraps upstream failures in HTTP 200 — detect and reject.
_JINA_FAILURE_MARKERS = (
    "warning: target url returned error",
    "markdown content:\n\n\n",
)


def is_blocked_or_challenge_html(text: str) -> bool:
    lower = (text or "").lower()
    if not lower:
        return False
    if any(marker in lower for marker in _JINA_FAILURE_MARKERS):
        return True
    if any(marker in lower for marker in _BLOCK_MARKERS):
        return True
    # Standalone "captcha" often appears in form widgets, not challenge pages.
    if "captcha" in lower:
        if any(widget in lower for widget in _RECAPTCHA_WIDGET_MARKERS) and len(lower) > 5000:
            return False
        if len(lower) < 4000:
            return True
    return False


def _looks_like_page_content(text: str) -> bool:
    """Reject binary/garbled cache responses that are long but not HTML/markdown."""
    sample = (text or "")[:4000].lower()
    if "<html" in sample or "<!doctype" in sample:
        return True
    if "markdown content:" in sample or sample.lstrip().startswith("#"):
        return True
    printable = sum(1 for ch in (text or "")[:2000] if ch.isprintable() or ch.isspace())
    return printable / max(len(text or ""), 1) > 0.85


def _is_success_status(status: int | None) -> bool:
    # 202 Accepted is used by Booking.com/AWS WAF as a bot-challenge shell, not a real page.
    return status == 200


def _is_usable(text: str, *, status: int | None = None) -> bool:
    if status is not None and not _is_success_status(status):
        return False
    if len(text or "") <= _MIN_USABLE_CHARS:
        return False
    if is_blocked_or_challenge_html(text):
        return False
    return _looks_like_page_content(text)


# ── httpx client factory ───────────────────────────────────────────────────────

def crawl_client(**kwargs: object) -> httpx.AsyncClient:
    """Return an httpx client with simple browser headers (primary crawl path)."""
    ua = _random_ua()
    kwargs.setdefault("timeout", 20.0)
    return httpx.AsyncClient(
        follow_redirects=True,
        headers=_simple_headers(ua),
        **kwargs,
    )


async def _get_text(client: httpx.AsyncClient, fetch_url: str) -> tuple[int | None, str, str]:
    """GET fetch_url; return (status, final_url, text)."""
    resp = await client.get(fetch_url)
    return resp.status_code, str(resp.url), resp.text or ""


# ── Fetch strategies ───────────────────────────────────────────────────────────

async def fetch_via_httpx(client: httpx.AsyncClient, url: str) -> Optional[FetchResult]:
    """
    Direct httpx fetch — primary path.

    Tries the crawl client (simple headers), then Googlebot, then full browser headers.
    """
    timeout = client.timeout

    async def _try(headers: dict[str, str], label: str) -> Optional[FetchResult]:
        try:
            async with httpx.AsyncClient(
                follow_redirects=True,
                headers=headers,
                timeout=timeout,
            ) as c:
                status, final_url, text = await _get_text(c, url)
                if _is_usable(text, status=status):
                    return FetchResult(status, final_url, text, label)
        except Exception as e:
            logger.debug("fetch_via_httpx (%s) failed for %s: %s", label, url, e)
        return None

    try:
        await asyncio.sleep(random.uniform(0.2, 0.5))
        status, final_url, text = await _get_text(client, url)
        if _is_usable(text, status=status):
            return FetchResult(status, final_url, text, "httpx")

        for headers, label in (
            (_googlebot_headers(), "httpx_googlebot"),
            (_browser_headers(), "httpx_browser"),
        ):
            result = await _try(headers, label)
            if result:
                return result

        return FetchResult(
            status_code=status,
            final_url=final_url,
            text=text if _is_success_status(status) else "",
            method="httpx",
            blocked=True,
            blocked_reason="not_usable",
        )
    except Exception as e:
        logger.debug("fetch_via_httpx failed for %s: %s", url, e)
        return None


# ── Playwright (headless Chromium + stealth) ───────────────────────────────────

_STEALTH_SCRIPT = """
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
window.chrome = { runtime: {} };
Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
"""


async def _apply_stealth(page) -> None:
    """Best-effort anti-automation tweaks for hotel sites with bot checks."""
    try:
        await page.evaluate(
            "() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); }"
        )
    except Exception:
        pass


async def fetch_via_playwright(url: str) -> Optional[FetchResult]:
    """Headless Chromium fetch for JS-rendered hotel pages."""
    settings = get_settings()
    if not settings.crawl_playwright_enabled:
        return None
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        logger.debug("playwright not installed — skipping browser fallback for %s", url)
        return None

    timeout_ms = settings.crawl_playwright_timeout_ms
    wait_ms = settings.crawl_playwright_wait_ms

    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-blink-features=AutomationControlled",
                ],
            )
            context = await browser.new_context(
                user_agent=_random_ua(),
                locale="en-US",
            )
            await context.add_init_script(_STEALTH_SCRIPT)
            page = await context.new_page()
            await _apply_stealth(page)
            response = await page.goto(
                url,
                wait_until="domcontentloaded",
                timeout=timeout_ms,
            )
            if wait_ms > 0:
                await page.wait_for_timeout(wait_ms)
            html = await page.content()
            status = response.status if response else 200
            await browser.close()

            if _is_usable(html, status=status):
                return FetchResult(status, url, html, "playwright")
    except Exception as e:
        logger.debug("fetch_via_playwright failed for %s: %s", url, e)
    return None


async def fetch_via_jina(url: str) -> Optional[FetchResult]:
    """Jina AI Reader — prepends https://r.jina.ai/ to the target URL."""
    jina_url = f"https://r.jina.ai/{url}"
    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=_FETCH_TIMEOUT,
            headers={"Accept": "text/plain, text/html, */*"},
        ) as client:
            status, final_url, text = await _get_text(client, jina_url)
            if _is_usable(text, status=status):
                return FetchResult(status, url, text, "jina")
            if text:
                logger.debug(
                    "fetch_via_jina rejected for %s (status=%s, %d chars)",
                    url,
                    status,
                    len(text),
                )
    except Exception as e:
        logger.debug("fetch_via_jina failed for %s: %s", url, e)
    return None


async def fetch_via_google_cache(url: str) -> Optional[FetchResult]:
    """Google web cache snapshot."""
    cache_url = (
        "https://webcache.googleusercontent.com/search"
        f"?q=cache:{quote(url, safe='')}"
    )
    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=_FETCH_TIMEOUT,
            headers=_browser_headers(),
        ) as client:
            status, final_url, text = await _get_text(client, cache_url)
            if _is_usable(text, status=status):
                return FetchResult(status, url, text, "google_cache")
    except Exception as e:
        logger.debug("fetch_via_google_cache failed for %s: %s", url, e)
    return None


async def fetch_via_wayback(url: str) -> Optional[FetchResult]:
    """Wayback Machine — resolve latest snapshot, then fetch it."""
    availability_url = f"https://archive.org/wayback/available?url={quote(url, safe='')}"
    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=_FETCH_TIMEOUT,
        ) as client:
            resp = await client.get(availability_url)
            if resp.status_code != 200:
                return None

            data = resp.json()
            closest = (data.get("archived_snapshots") or {}).get("closest") or {}
            if not closest.get("available"):
                return None

            snapshot_url = closest.get("url")
            if not snapshot_url:
                return None

            status, final_url, text = await _get_text(client, snapshot_url)
            if _is_usable(text, status=status):
                return FetchResult(status, url, text, "wayback")
    except Exception as e:
        logger.debug("fetch_via_wayback failed for %s: %s", url, e)
    return None


def _wrap_jina_reader_markdown(url: str, markdown: str, title: str | None = None) -> str:
    """Wrap markdown so the Jina markdown extractor in extract.py can parse it."""
    title_line = (title or "").strip()
    return f"Title: {title_line}\n\nURL Source: {url}\n\nMarkdown Content:\n{markdown}"


async def fetch_via_firecrawl(url: str) -> Optional[FetchResult]:
    """
    Firecrawl scrape API — paid final fallback.

    Returns markdown wrapped in Jina Reader format for extract.py compatibility.
    """
    settings = get_settings()
    api_key = (settings.firecrawl_api_key or "").strip()
    if not api_key or not settings.crawl_firecrawl_enabled:
        return None

    try:
        async with httpx.AsyncClient(timeout=_FIRECRAWL_TIMEOUT) as client:
            resp = await client.post(
                _FIRECRAWL_API_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "url": url,
                    "formats": ["markdown"],
                    "onlyMainContent": True,
                },
            )
            if resp.status_code != 200:
                logger.debug(
                    "fetch_via_firecrawl HTTP %s for %s: %s",
                    resp.status_code,
                    url,
                    (resp.text or "")[:200],
                )
                return None

            payload = resp.json()
            if not payload.get("success"):
                logger.debug(
                    "fetch_via_firecrawl unsuccessful for %s: %s",
                    url,
                    payload.get("error") or payload,
                )
                return None

            data = payload.get("data") or {}
            markdown = (data.get("markdown") or "").strip()
            if not markdown:
                return None

            metadata = data.get("metadata") or {}
            title = metadata.get("title") or metadata.get("ogTitle") or ""
            wrapped = _wrap_jina_reader_markdown(url, markdown, title=str(title) if title else None)

            if _is_usable(wrapped, status=200):
                return FetchResult(200, url, wrapped, "firecrawl")

            logger.debug(
                "fetch_via_firecrawl rejected for %s (%d chars after wrap)",
                url,
                len(wrapped),
            )
    except Exception as e:
        logger.warning("fetch_via_firecrawl failed for %s: %s", url, e)
    return None


async def crawl_throttle() -> None:
    """Pause between HTTP requests to reduce upstream rate limiting."""
    delay = get_settings().crawl_request_delay_sec
    if delay > 0:
        await asyncio.sleep(delay)


def _content_fingerprint(text: str) -> str:
    """Rough fingerprint to skip near-duplicate fetches (httpx vs playwright)."""
    sample = re.sub(r"\s+", " ", (text or "")[:8000]).strip().lower()
    return f"{len(text or '')}:{hash(sample)}"


# ── Public fetch entry point ───────────────────────────────────────────────────

async def fetch_page(
    client: httpx.AsyncClient,
    url: str,
    *,
    allow_playwright_fallback: bool = True,
    fallback: FetchFallback | None = None,
) -> FetchResult:
    """
    Fetch a URL using a multi-service fallback chain.

    fallback levels:
    - direct: httpx only (+ Googlebot / browser header retries)
    - free: direct + Jina + Google Cache + Wayback
    - full: free + Firecrawl (paid)

    allow_playwright_fallback=False is equivalent to fallback=\"direct\".
    """
    if fallback is None:
        fallback = "full" if allow_playwright_fallback else "direct"

    fetchers: list[tuple[str, Callable[[], Awaitable[Optional[FetchResult]]]]] = [
        ("httpx", lambda: fetch_via_httpx(client, url)),
    ]

    if fallback in ("free", "full"):
        fetchers.extend(
            [
                ("playwright", lambda: fetch_via_playwright(url)),
                ("jina", lambda: fetch_via_jina(url)),
                ("google_cache", lambda: fetch_via_google_cache(url)),
                ("wayback", lambda: fetch_via_wayback(url)),
            ]
        )
    if fallback == "full":
        fetchers.append(("firecrawl", lambda: fetch_via_firecrawl(url)))

    for method_name, fetcher in fetchers:
        try:
            result = await fetcher()
        except Exception as e:
            logger.debug("fetch: %s raised for %s: %s", method_name, url, e)
            continue

        if result and _is_usable(result.text, status=result.status_code):
            result.method = method_name
            result.blocked = False
            logger.info(
                "fetch: %s succeeded for %s (status=%s, %d chars)",
                method_name,
                url,
                result.status_code,
                len(result.text),
            )
            return result

        if result:
            logger.debug(
                "fetch: %s not usable for %s (status=%s, %d chars)",
                method_name,
                url,
                result.status_code,
                len(result.text or ""),
            )

    return FetchResult(
        None,
        url,
        "",
        "all_failed",
        blocked=True,
        blocked_reason="all_methods_failed",
    )


async def fetch_all_free_methods(
    client: httpx.AsyncClient,
    url: str,
) -> list[FetchResult]:
    """
    Run every free fetch strategy and return all usable results.

    Unlike fetch_page(), this does not stop at the first success — httpx, Playwright,
    Jina, Google Cache, and Wayback are all attempted so extractors can merge facts
    from whichever sources return content.
    """
    fetchers: list[tuple[str, Callable[[], Awaitable[Optional[FetchResult]]]]] = [
        ("httpx", lambda: fetch_via_httpx(client, url)),
        ("playwright", lambda: fetch_via_playwright(url)),
        ("jina", lambda: fetch_via_jina(url)),
        ("google_cache", lambda: fetch_via_google_cache(url)),
        ("wayback", lambda: fetch_via_wayback(url)),
    ]

    results: list[FetchResult] = []
    seen: set[str] = set()

    for method_name, fetcher in fetchers:
        try:
            result = await fetcher()
        except Exception as e:
            logger.debug("fetch_all_free: %s raised for %s: %s", method_name, url, e)
            continue

        if not result or not _is_usable(result.text, status=result.status_code):
            continue

        fingerprint = _content_fingerprint(result.text)
        if fingerprint in seen:
            logger.debug("fetch_all_free: skipping duplicate %s content for %s", method_name, url)
            continue
        seen.add(fingerprint)

        result.method = method_name
        result.blocked = False
        results.append(result)
        logger.info(
            "fetch_all_free: %s succeeded for %s (status=%s, %d chars)",
            method_name,
            url,
            result.status_code,
            len(result.text),
        )

    return results
