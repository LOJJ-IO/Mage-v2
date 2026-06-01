"""Extract slot values from page HTML using schema-aware heuristics."""
from __future__ import annotations

import re
import json
from html import unescape
from typing import Any
from urllib.parse import urlparse

# Require H:MM (or bare hour) — avoids matching ":00 PM" fragments from "6:00 PM".
_TIME = (
    r"(?:"
    r"(?:1[0-2]|0?[1-9])\s*:\s*[0-5]\d\s*(?:a\.?m\.?|p\.?m\.?)"
    r"|"
    r"(?:1[0-2]|0?[1-9])\s*(?:a\.?m\.?|p\.?m\.?)"
    r")"
)
_TIME_RANGE = re.compile(
    rf"(?i){_TIME}\s*(?:[-–—]|to|until|through|\|)\s*{_TIME}",
)
_SINGLE_TIME = re.compile(rf"(?i){_TIME}")

_PHONE = re.compile(
    r"(?:\+?\d{1,2}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}",
)

_BOOKING_WIDGET_SIGNALS = (
    "arrival date",
    "select date",
    "select your dates",
    "check availability",
    "book now",
    "booking widget",
    "reservation:",
    "reservations:",
    "nightly rate",
    "lowest rate",
    "rate guarantee",
)

_AMENITY_ITEM_HINTS = (
    "breakfast",
    "pool",
    "fitness",
    "exercise",
    "gym",
    "sauna",
    "wifi",
    "wireless",
    "internet",
    "business",
    "parking",
    "elevator",
    "laundry",
    "security",
    "ice machine",
    "safe",
    "whirlpool",
    "hot tub",
    "accessible",
    "ramps",
    "newspaper",
    "public address",
    "stairwell",
)

_SLOT_KEYWORDS: dict[str, list[str]] = {
    "property.check_in.time": ["check-in", "check in", "checkin", "arrival"],
    "property.check_out.time": ["check-out", "check out", "checkout", "departure"],
    "dining.breakfast.hours": ["breakfast", "continental breakfast", "complimentary breakfast"],
    "dining.restaurant.hours": ["restaurant", "on-site dining", "dining room"],
    "dining.bar.hours": ["bar", "lounge", "cocktail"],
    "amenities.pool.hours": ["pool", "swimming pool", "indoor pool", "outdoor pool"],
    "amenities.fitness.hours": ["fitness", "gym", "fitness center", "workout"],
    "amenities.spa.hours": ["spa"],
    "dining.room_service.hours": ["room service"],
    "parking.self.location": ["self-parking", "self parking", "parking garage", "parking lot"],
    "policies.pets.allowed": ["pet policy", "pets", "pet-friendly", "pet friendly"],
    "services.housekeeping.policy": ["housekeeping"],
    "property.front_desk.phone": ["front desk", "reception"],
    "connectivity.wifi.network_name": ["wi-fi", "wifi", "wireless", "internet"],
    "connectivity.wifi.password": ["wi-fi password", "wifi password", "internet password", "password"],
}


def _strip_html(html: str) -> str:
    text = re.sub(r"<script[^>]*>.*?</script>", " ", html, flags=re.S | re.I)
    text = re.sub(r"<style[^>]*>.*?</style>", " ", text, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _clean_html_text(value: str) -> str:
    return _strip_html(unescape(value or "")).strip()


def _normalize_time_token(raw: str) -> str:
    t = raw.strip().rstrip(".,;")
    t = re.sub(r"\s+", " ", t)
    t = re.sub(r"(?i)\ba\.m\.\b", "AM", t)
    t = re.sub(r"(?i)\bp\.m\.\b", "PM", t)
    t = re.sub(r"(?i)\bam\b", "AM", t)
    t = re.sub(r"(?i)\bpm\b", "PM", t)
    return t


def _is_valid_time_value(value: str) -> bool:
    if not value or len(value) < 3:
        return False
    # Reject bare "00 AM" fragments, not legitimate "6:00 AM".
    if re.search(r"(?i)(?<![:\d])00\s*(?:am|pm|a\.m|p\.m)\b", value):
        return False
    if not _SINGLE_TIME.search(value):
        return False
    return True


def _looks_like_booking_widget_context(text: str) -> bool:
    lower = text.lower()
    return any(signal in lower for signal in _BOOKING_WIDGET_SIGNALS)


def _format_hours_match(match: re.Match[str]) -> str:
    return f"{_normalize_time_token(match.group(0))}"


def _extract_hours_near(
    text: str,
    keywords: list[str],
    *,
    window: int = 220,
    require_range: bool = False,
) -> str | None:
    lower = text.lower()
    best_range: str | None = None
    best_single: str | None = None
    is_check_time = any("check" in kw or kw in ("arrival", "departure") for kw in keywords)

    for kw in keywords:
        start = 0
        while True:
            pos = lower.find(kw, start)
            if pos < 0:
                break
            # Only look after the keyword so we don't grab unrelated times (e.g. check-in vs check-out).
            chunk = text[pos : pos + window]
            if _looks_like_booking_widget_context(chunk):
                start = pos + len(kw)
                continue
            range_match = _TIME_RANGE.search(chunk)
            if range_match:
                formatted = _format_hours_match(range_match)
                if _is_valid_time_value(formatted):
                    return formatted.replace("  ", " ")
            if require_range:
                start = pos + len(kw)
                continue
            single = _SINGLE_TIME.search(chunk)
            if single and not best_single:
                prefix = chunk[: single.start()].lower()
                if not is_check_time and ("check-in" in prefix or "check in" in prefix or "check-out" in prefix or "check out" in prefix):
                    start = pos + len(kw)
                    continue
                if not is_check_time and not any(token in prefix for token in ("hour", "open", "close", "till", "until", "daily")):
                    start = pos + len(kw)
                    continue
                candidate = _normalize_time_token(single.group(0))
                if _is_valid_time_value(candidate):
                    best_single = candidate
            start = pos + len(kw)

    return best_range or best_single


def _time_context_score(context: str) -> int:
    lower = context.lower()
    score = 0
    if "about-info-value" in lower or "about-info-desc" in lower:
        score += 120
    if "information" in lower and "polic" in lower:
        score += 80
    if _looks_like_booking_widget_context(context):
        score -= 100
    if any(token in lower for token in ("book now", "get reservation", "booking widget", "close booking")):
        score -= 80
    return score


def _extract_labeled_time(text: str, labels: list[str]) -> str | None:
    best_value: str | None = None
    best_score = -999
    for label in labels:
        pattern = re.compile(
            rf"(?i){re.escape(label)}[^.\n]{{0,50}}?({_TIME}(?:\s*(?:[-–—]|to|until|through)\s*{_TIME})?)",
        )
        for match in pattern.finditer(text):
            context = text[max(0, match.start() - 160) : match.end() + 160]
            value = _normalize_time_token(match.group(1))
            if not _is_valid_time_value(value):
                continue
            score = _time_context_score(context)
            if score > best_score:
                best_score = score
                best_value = value
    if best_score < 0:
        return None
    return best_value


_POLICY_LABEL_SLOTS: dict[str, str] = {
    "check-in": "property.check_in.time",
    "check in": "property.check_in.time",
    "check-out": "property.check_out.time",
    "check out": "property.check_out.time",
    "pets allowed": "policies.pets.allowed",
    "valet parking": "parking.valet.available",
}


def _extract_policy_info_boxes(html: str) -> dict[str, tuple[Any, float]]:
    """Parse structured hotel policy blocks (e.g. Choice Hotels about-info boxes)."""
    facts: dict[str, tuple[Any, float]] = {}
    for match in re.finditer(
        r'(?is)<div[^>]+class=["\'][^"\']*about-info-desc[^"\']*["\'][^>]*>(.*?)</div>\s*'
        r'<div[^>]+class=["\'][^"\']*about-info-value[^"\']*["\'][^>]*>(.*?)</div>',
        html,
    ):
        label = _clean_html_text(match.group(1)).rstrip(":").strip().lower()
        value = _clean_html_text(match.group(2))
        slot = _POLICY_LABEL_SLOTS.get(label)
        if not slot or not value:
            continue
        if slot.endswith(".time"):
            normalized = _normalize_time_value(value)
            if normalized:
                facts[slot] = (normalized, 0.93)
        elif slot == "parking.valet.available":
            facts[slot] = (value.lower() in ("yes", "true", "available"), 0.85)
        else:
            facts[slot] = (value, 0.88)
    return facts


def _normalize_time_value(raw: str) -> str | None:
    value = _normalize_time_token(raw)
    range_match = _TIME_RANGE.search(value)
    if range_match:
        candidate = _normalize_time_token(range_match.group(0))
        return candidate if _is_valid_time_value(candidate) else None
    single = _SINGLE_TIME.search(value)
    if single:
        candidate = _normalize_time_token(single.group(0))
        return candidate if _is_valid_time_value(candidate) else None
    iso = re.search(r"\b(?:T)?([01]?\d|2[0-3]):([0-5]\d)\b", raw)
    if iso:
        hour = int(iso.group(1))
        minute = int(iso.group(2))
        suffix = "AM" if hour < 12 else "PM"
        display_hour = hour % 12 or 12
        return f"{display_hour}:{minute:02d} {suffix}"
    return None


def _extract_phone_near(text: str, keywords: list[str]) -> str | None:
    lower = text.lower()
    for kw in keywords:
        pos = lower.find(kw)
        if pos >= 0:
            chunk = text[pos : pos + 120]
            match = _PHONE.search(chunk)
            if match:
                return match.group(0).strip()
    match = _PHONE.search(text)
    return match.group(0).strip() if match else None


def _iter_json_ld_nodes(value: Any) -> list[dict[str, Any]]:
    nodes: list[dict[str, Any]] = []
    if isinstance(value, dict):
        nodes.append(value)
        graph = value.get("@graph")
        if isinstance(graph, list):
            for item in graph:
                nodes.extend(_iter_json_ld_nodes(item))
    elif isinstance(value, list):
        for item in value:
            nodes.extend(_iter_json_ld_nodes(item))
    return nodes


def _json_ld_type(node: dict[str, Any]) -> set[str]:
    raw_type = node.get("@type") or node.get("type")
    if isinstance(raw_type, str):
        return {raw_type.lower()}
    if isinstance(raw_type, list):
        return {str(item).lower() for item in raw_type}
    return set()


def _extract_json_ld(html: str) -> dict[str, tuple[Any, float]]:
    facts: dict[str, tuple[Any, float]] = {}
    for match in re.finditer(
        r"(?is)<script[^>]*application/ld\+json[^>]*>(.*?)</script>",
        html,
    ):
        raw = _clean_html_text(match.group(1))
        if not raw:
            continue
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            continue

        for node in _iter_json_ld_nodes(parsed):
            types = _json_ld_type(node)
            if not types.intersection({"hotel", "lodgingbusiness", "localbusiness"}):
                continue
            name = node.get("name")
            if isinstance(name, str) and len(name.strip()) > 3:
                facts["property.name"] = (name.strip(), 0.95)
            telephone = node.get("telephone")
            if isinstance(telephone, str) and telephone.strip():
                facts["property.front_desk.phone"] = (telephone.strip(), 0.9)
            check_in = node.get("checkinTime") or node.get("checkInTime")
            if isinstance(check_in, str):
                normalized = _normalize_time_value(check_in)
                if normalized:
                    facts["property.check_in.time"] = (normalized, 0.95)
            check_out = node.get("checkoutTime") or node.get("checkOutTime")
            if isinstance(check_out, str):
                normalized = _normalize_time_value(check_out)
                if normalized:
                    facts["property.check_out.time"] = (normalized, 0.95)
            address = node.get("address")
            if isinstance(address, dict):
                parts = [
                    address.get("streetAddress"),
                    address.get("addressLocality"),
                    address.get("addressRegion"),
                    address.get("postalCode"),
                    address.get("addressCountry"),
                ]
                location = ", ".join(str(part).strip() for part in parts if part)
                if location:
                    facts["property.location"] = (location, 0.9)
            amenities = node.get("amenityFeature")
            if isinstance(amenities, list):
                names = []
                for amenity in amenities:
                    if isinstance(amenity, dict) and amenity.get("name"):
                        names.append(str(amenity["name"]).strip())
                    elif isinstance(amenity, str):
                        names.append(amenity.strip())
                names = [name for name in names if name]
                if names:
                    deduped = list(dict.fromkeys(names))
                    facts["property.amenities.summary"] = (", ".join(deduped[:20]), 0.9)
    return facts


def _clean_property_name(name: str) -> str | None:
    cleaned = re.sub(r"\s+", " ", name or "").strip(" -|•")
    if not cleaned or len(cleaned) < 3:
        return None
    cleaned = re.sub(r"(?i)\s*[-|]\s*(official site|book direct|best rate).*$", "", cleaned).strip()
    cleaned = re.sub(r"[®™]", "", cleaned).strip()
    if len(cleaned) > 120:
        return None
    return cleaned


def _parse_meta_tags(html: str) -> dict[str, str]:
    """Parse meta name/property/itemprop → content (attribute order agnostic)."""
    tags: dict[str, str] = {}
    for match in re.finditer(r"(?is)<meta\b[^>]*>", html):
        tag = match.group(0)
        key: str | None = None
        for attr in ("property", "name", "itemprop"):
            attr_match = re.search(rf'(?is)\b{attr}=["\']([^"\']+)["\']', tag)
            if attr_match:
                key = attr_match.group(1).strip().lower()
                break
        if not key:
            continue
        content_match = re.search(r'(?is)\bcontent=["\']([^"\']*)["\']', tag)
        if not content_match:
            continue
        content = _clean_html_text(content_match.group(1))
        if content:
            tags[key] = content
    return tags


_OG_TITLE_SUFFIX_RE = re.compile(
    r"(?i)\s*[|\-–—]\s*(?:"
    r"booking\.com|tripadvisor|expedia|hotels\.com|agoda|kayak|google|official site|book direct"
    r").*$",
)


def _clean_og_title(title: str) -> str | None:
    trimmed = _OG_TITLE_SUFFIX_RE.sub("", title or "").strip()
    return _clean_property_name(trimmed)


def _extract_facts_from_rich_text(
    text: str,
    *,
    base_confidence: float = 0.76,
) -> dict[str, tuple[Any, float]]:
    """Pull slot values from OG descriptions and other compact meta text."""
    facts: dict[str, tuple[Any, float]] = {}
    if not text or len(text) < 12:
        return facts

    check_in = _extract_labeled_time(text, ["check-in", "check in", "checkin", "arrival from", "arrival"])
    if check_in:
        facts["property.check_in.time"] = (check_in, base_confidence + 0.04)
    check_out = _extract_labeled_time(
        text,
        ["check-out", "check out", "checkout", "departure until", "departure"],
    )
    if check_out:
        facts["property.check_out.time"] = (check_out, base_confidence + 0.04)

    rich_slots = (
        "dining.breakfast.hours",
        "amenities.pool.hours",
        "amenities.fitness.hours",
        "property.front_desk.phone",
    )
    for slot_key in rich_slots:
        keywords = _SLOT_KEYWORDS.get(slot_key, [])
        if slot_key.endswith(".hours"):
            hours = _extract_hours_near(text, keywords, require_range=True)
            if hours:
                facts[slot_key] = (hours, base_confidence)
        elif slot_key == "property.front_desk.phone":
            phone = _extract_phone_near(text, keywords) or _extract_phone_near(text, ["phone", "tel", "call"])
            if phone:
                facts[slot_key] = (phone, base_confidence)

    pet = _extract_pet_policy(text)
    if pet:
        facts["policies.pets.allowed"] = (pet, base_confidence - 0.04)
    for key, value in _extract_parking(text).items():
        facts[key] = (value, base_confidence - 0.06)
    return facts


def _extract_open_graph_facts(html: str) -> dict[str, tuple[Any, float]]:
    """Extract hotel facts from Open Graph, Twitter Card, and standard meta tags."""
    meta = _parse_meta_tags(html)
    if not meta:
        return {}

    facts: dict[str, tuple[Any, float]] = {}

    for name_key, confidence in (
        ("og:site_name", 0.86),
        ("application-name", 0.84),
        ("og:title", 0.8),
        ("twitter:title", 0.78),
        ("twitter:site", 0.72),
    ):
        raw = meta.get(name_key)
        if not raw:
            continue
        name = _clean_og_title(raw) if "title" in name_key else _clean_property_name(raw)
        if name:
            facts["property.name"] = (name, confidence)
            break

    description = (
        meta.get("og:description")
        or meta.get("twitter:description")
        or meta.get("description")
    )
    if description:
        for key, (value, confidence) in _extract_facts_from_rich_text(description).items():
            facts.setdefault(key, (value, confidence))

    address_parts = [
        meta.get("og:street-address"),
        meta.get("og:locality"),
        meta.get("og:region"),
        meta.get("og:postal-code"),
        meta.get("og:country-name"),
    ]
    location = ", ".join(str(part).strip() for part in address_parts if part and str(part).strip())
    if location:
        facts["property.location"] = (location, 0.84)

    lat = meta.get("place:location:latitude") or meta.get("og:latitude")
    lng = meta.get("place:location:longitude") or meta.get("og:longitude")
    if not lat and meta.get("geo.position"):
        parts = meta["geo.position"].split(";")
        if parts:
            lat = parts[0].strip()
            lng = parts[1].strip() if len(parts) > 1 else lng
    if lat and lng:
        facts["property.location"] = (f"{lat}, {lng}", 0.8)

    for meta_key, content in meta.items():
        key_lower = meta_key.lower()
        if re.search(r"check[_-]?in(?:time)?|checkintime", key_lower):
            normalized = _normalize_time_value(content)
            if normalized:
                facts["property.check_in.time"] = (normalized, 0.9)
        elif re.search(r"check[_-]?out(?:time)?|checkouttime", key_lower):
            normalized = _normalize_time_value(content)
            if normalized:
                facts["property.check_out.time"] = (normalized, 0.9)
        elif re.search(r"telephone|phone(?:number)?", key_lower) and "iphone" not in key_lower:
            phone = _extract_phone_near(content, ["phone", "tel"]) or content.strip()
            if phone and _PHONE.search(phone):
                facts["property.front_desk.phone"] = (phone, 0.86)

    return facts


def _extract_meta_facts(html: str) -> dict[str, tuple[Any, float]]:
    """Backward-compatible alias for Open Graph/meta extraction."""
    return _extract_open_graph_facts(html)


def _extract_attr_value(tag: str) -> str:
    content = re.search(r'(?is)\bcontent=["\']([^"\']+)["\']', tag)
    if content:
        return _clean_html_text(content.group(1))
    datetime_value = re.search(r'(?is)\bdatetime=["\']([^"\']+)["\']', tag)
    if datetime_value:
        return _clean_html_text(datetime_value.group(1))
    return _clean_html_text(tag)


def _extract_selector_facts(html: str) -> dict[str, tuple[Any, float]]:
    facts: dict[str, tuple[Any, float]] = {}
    selector_patterns = {
        "property.check_in.time": (
            r'(?is)<[^>]+(?:itemprop|data-field|class|id)=["\'][^"\']*(?:checkinTime|check[_-]?in|check-in)[^"\']*["\'][^>]*>.*?</[^>]+>',
            r'(?is)<meta[^>]+(?:itemprop|name|property)=["\'][^"\']*(?:checkinTime|check[_-]?in|check-in)[^"\']*["\'][^>]*>',
        ),
        "property.check_out.time": (
            r'(?is)<[^>]+(?:itemprop|data-field|class|id)=["\'][^"\']*(?:checkoutTime|check[_-]?out|check-out)[^"\']*["\'][^>]*>.*?</[^>]+>',
            r'(?is)<meta[^>]+(?:itemprop|name|property)=["\'][^"\']*(?:checkoutTime|check[_-]?out|check-out)[^"\']*["\'][^>]*>',
        ),
        "property.name": (
            r'(?is)<h1[^>]+(?:class|id)=["\'][^"\']*(?:property|hotel)[_-]?name[^"\']*["\'][^>]*>.*?</h1>',
            r'(?is)<[^>]+itemprop=["\']name["\'][^>]*>.*?</[^>]+>',
        ),
    }
    for key, patterns in selector_patterns.items():
        for pattern in patterns:
            match = re.search(pattern, html)
            if not match:
                continue
            raw = _extract_attr_value(match.group(0))
            if key.endswith(".time"):
                normalized = _normalize_time_value(raw)
                if normalized:
                    facts[key] = (normalized, 0.85)
                    break
            else:
                name = _clean_property_name(raw)
                if name:
                    facts[key] = (name, 0.85)
                    break
    return facts


def _extract_wifi_credentials(text: str) -> tuple[str | None, str | None]:
    network = None
    password = None
    net_match = re.search(
        r"(?i)(?:network|ssid|wi-fi name)[:\s]+['\"]?([A-Za-z0-9._-]{2,32})['\"]?",
        text,
    )
    if net_match:
        network = net_match.group(1)
    pass_match = re.search(
        r"(?i)(?:password|passcode|access code)[:\s]+['\"]?([A-Za-z0-9._-]{2,32})['\"]?",
        text,
    )
    if pass_match:
        password = pass_match.group(1)
    return network, password


def _extract_pet_policy(text: str) -> str | None:
    lower = text.lower()
    if "pet" not in lower and "dog" not in lower and "cat" not in lower:
        return None
    for pattern in (
        r"(?i)(pet[- ]friendly[^.]{0,120}\.)",
        r"(?i)(pets (?:are )?(?:not )?allowed[^.]{0,80}\.)",
        r"(?i)(no pets[^.]{0,60}\.)",
    ):
        match = re.search(pattern, text)
        if match:
            return match.group(1).strip()
    if "pet-friendly" in lower or "pet friendly" in lower:
        return "Pet-friendly"
    if "no pets" in lower:
        return "No pets allowed"
    return None


def _extract_parking(text: str) -> dict[str, Any]:
    lower = text.lower()
    out: dict[str, Any] = {}
    if "parking" not in lower:
        return out
    if any(w in lower for w in ("complimentary parking", "free parking", "self-parking available", "on-site parking")):
        out["parking.self.available"] = True
    elif re.search(r"(?i)parking (?:is )?available", text):
        out["parking.self.available"] = True
    loc = re.search(
        r"(?i)(?:parking|garage)[^.]{0,60}(?:on-site|adjacent|underground|valet|self-park[^.]{0,40})",
        text,
    )
    if loc:
        out["parking.self.location"] = loc.group(0).strip()[:120]
    return out


def _extract_amenities_summary(html: str, text: str) -> str | None:
    explicit_items = [
        _clean_html_text(match.group(1))
        for match in re.finditer(
            r'(?is)<div[^>]+class=["\'][^"\']*services-listing-name[^"\']*["\'][^>]*>(.*?)</div>',
            html,
        )
    ]
    explicit_items = [
        item
        for item in explicit_items
        if 3 <= len(item) <= 60 and any(hint in item.lower() for hint in _AMENITY_ITEM_HINTS)
    ]
    explicit_deduped = list(dict.fromkeys(explicit_items))
    if len(explicit_deduped) >= 3:
        return ", ".join(explicit_deduped[:15])

    html_lower = html.lower()
    idx = html_lower.rfind("hotel amenities")
    chunk = html[idx : idx + 10000] if idx >= 0 else html

    items = re.findall(r"(?is)<li[^>]*>(.*?)</li>", chunk)
    cleaned: list[str] = []
    for item in items:
        t = _strip_html(item)
        t = re.sub(r"\s+", " ", t).strip(" .,:;|-")
        if len(t) < 3 or len(t) > 60:
            continue
        low = t.lower()
        if any(x in low for x in ("book now", "reservations", "privacy", "contact us", "cookie")):
            continue
        if not any(hint in low for hint in _AMENITY_ITEM_HINTS):
            continue
        if t not in cleaned:
            cleaned.append(t)
    if len(cleaned) >= 3:
        return ", ".join(cleaned[:15])

    # Fallback for sites that do not use list tags.
    lower = text.lower()
    start = lower.find("hotel amenities")
    if start < 0:
        return None
    window = text[start : start + 700]
    tokens = [re.sub(r"\s+", " ", tok).strip(" .,:;|-") for tok in re.split(r"[•|,]", window)]
    tokens = [
        t
        for t in tokens
        if 3 <= len(t) <= 40
        and "amenit" not in t.lower()
        and any(hint in t.lower() for hint in _AMENITY_ITEM_HINTS)
    ]
    uniq: list[str] = []
    for token in tokens:
        if token not in uniq:
            uniq.append(token)
    if len(uniq) >= 3:
        return ", ".join(uniq[:12])
    return None


def _extract_property_name(html: str, url: str) -> str | None:
    meta = _parse_meta_tags(html)
    for key in ("og:site_name", "application-name", "og:title", "twitter:title"):
        raw = meta.get(key)
        if not raw:
            continue
        name = _clean_og_title(raw) if "title" in key else _clean_property_name(raw)
        if name:
            return name

    title = re.search(r"(?is)<title[^>]*>(.*?)</title>", html)
    if not title:
        return None
    raw = _strip_html(title.group(1))
    # Split common title separators and keep the most hotel-like chunk.
    chunks = [c.strip() for c in re.split(r"[|•»\-]+", raw) if c.strip()]
    if not chunks:
        return None
    candidates = chunks[:3]
    for chunk in candidates:
        low = chunk.lower()
        if any(w in low for w in ("hotel", "inn", "suites", "resort", "lodge", "motel")) and len(chunk) > 3:
            return chunk
    # Fall back to first chunk for obvious hotel domains.
    if any(w in url.lower() for w in ("hotel", "inn", "suites", "resort", "lodge", "motel")):
        return candidates[0]
    return None


def _extract_faq_snippets(html: str) -> dict[str, str]:
    """Map FAQ question keywords to answer snippets."""
    snippets: dict[str, str] = {}
    blocks = re.findall(
        r"(?is)(?:<h[2-4][^>]*>(.*?)<\/h[2-4]>|<dt[^>]*>(.*?)<\/dt>)\s*(?:<p[^>]*>(.*?)<\/p>|<dd[^>]*>(.*?)<\/dd>)",
        html,
    )
    for groups in blocks:
        question = _strip_html(groups[0] or groups[1] or "")
        answer = _strip_html(groups[2] or groups[3] or "")
        if not question or not answer:
            continue
        q_lower = question.lower()
        if "pool" in q_lower and "hour" in q_lower:
            snippets["amenities.pool.hours"] = answer
        elif "breakfast" in q_lower:
            snippets["dining.breakfast.hours"] = answer
        elif "check-in" in q_lower or "check in" in q_lower:
            snippets["property.check_in.time"] = answer
        elif "check-out" in q_lower or "check out" in q_lower:
            snippets["property.check_out.time"] = answer
        elif "parking" in q_lower:
            snippets["parking.self.location"] = answer
        elif "pet" in q_lower:
            snippets["policies.pets.allowed"] = answer
        elif "wifi" in q_lower or "wi-fi" in q_lower:
            snippets["connectivity.wifi.network_name"] = answer
    return snippets


def classify_page_type(url: str, text: str) -> str:
    lower = (url + " " + text[:800]).lower()
    if "pool" in lower or "swim" in lower:
        return "pool"
    if "fitness" in lower or "gym" in lower:
        return "fitness"
    if "faq" in lower:
        return "faq"
    if "parking" in lower:
        return "parking"
    if "dining" in lower or "restaurant" in lower or "breakfast" in lower:
        return "dining"
    if "amenit" in lower:
        return "amenities"
    if any(w in lower for w in ("check-in", "check-out", "policy", "policies")):
        return "policies"
    return "general"


def extract_facts_from_page(
    url: str,
    html: str,
    *,
    schema_version: str = "v1",
) -> dict[str, dict[str, Any]]:
    if not html or len(html) < 50:
        return {}

    text = _strip_html(html)
    page_type = classify_page_type(url, text)
    extracted: dict[str, dict[str, Any]] = {}

    def set_slot(
        key: str,
        value: Any,
        confidence: float = 0.6,
        *,
        extraction_method: str = "regex",
    ) -> None:
        if value is None:
            return
        if isinstance(value, str):
            value = value.strip()
            if not value:
                return
            if key.endswith(".hours") or key.endswith(".time"):
                if not _is_valid_time_value(value):
                    return
        existing = extracted.get(key)
        if existing and (existing.get("confidence") or 0) > confidence:
            return
        extracted[key] = {
            "value": value,
            "status": "filled",
            "confidence": confidence,
            "extraction_method": extraction_method,
            "source_url": url,
            "source_snippet": str(value)[:200],
        }

    for method_name, structured_facts in (
        ("json_ld", _extract_json_ld(html)),
        ("policy_box", _extract_policy_info_boxes(html)),
        ("open_graph", _extract_open_graph_facts(html)),
        ("selector", _extract_selector_facts(html)),
    ):
        for key, (value, confidence) in structured_facts.items():
            set_slot(key, value, confidence, extraction_method=method_name)

    # FAQ structured content first (higher confidence).
    for key, answer in _extract_faq_snippets(html).items():
        if key in extracted:
            continue
        if key.endswith(".hours") or key.endswith(".time"):
            hours = _extract_hours_near(
                answer,
                _SLOT_KEYWORDS.get(key, []),
                require_range=key.endswith(".hours"),
            ) or (None if key.endswith(".hours") else answer)
            set_slot(key, hours, 0.85, extraction_method="faq")
        else:
            set_slot(key, answer, 0.8, extraction_method="faq")

    # Schema keyword → slot extractions.
    for slot_key, keywords in _SLOT_KEYWORDS.items():
        if slot_key in extracted:
            continue
        if slot_key.endswith(".hours") or slot_key.endswith(".time"):
            hours = _extract_hours_near(text, keywords, require_range=slot_key.endswith(".hours"))
            if hours:
                conf = 0.75 if page_type in slot_key.split(".")[0] else 0.65
                method = "regex"
                if slot_key in ("property.check_in.time", "property.check_out.time"):
                    sample = text.lower()
                    idx = sample.find(keywords[0]) if keywords else -1
                    if idx >= 0:
                        ctx = text[max(0, idx - 160) : idx + 220]
                        if _time_context_score(ctx) < 0:
                            method = "booking_widget"
                            conf = 0.2
                set_slot(slot_key, hours, conf, extraction_method=method)
        elif slot_key == "property.front_desk.phone":
            phone = _extract_phone_near(text, keywords)
            if phone:
                set_slot(slot_key, phone, 0.7)
        elif slot_key == "connectivity.wifi.network_name":
            network, password = _extract_wifi_credentials(text)
            if network:
                set_slot("connectivity.wifi.network_name", network, 0.65)
            if password and "connectivity.wifi.password" not in extracted:
                set_slot("connectivity.wifi.password", password, 0.65)
        elif slot_key == "connectivity.wifi.password":
            continue
        elif slot_key == "policies.pets.allowed":
            policy = _extract_pet_policy(text)
            if policy:
                set_slot(slot_key, policy, 0.7)

    # Explicit labeled check-in/out.
    if "property.check_in.time" not in extracted:
        check_in = _extract_labeled_time(text, ["check-in", "check in"])
        if check_in:
            set_slot("property.check_in.time", check_in, 0.8, extraction_method="labeled_regex")
    if "property.check_out.time" not in extracted:
        check_out = _extract_labeled_time(text, ["check-out", "check out"])
        if check_out:
            set_slot("property.check_out.time", check_out, 0.8, extraction_method="labeled_regex")

    # Parking heuristics.
    for key, value in _extract_parking(text).items():
        if key not in extracted:
            set_slot(key, value, 0.6)

    amenities_summary = _extract_amenities_summary(html, text)
    if amenities_summary:
        set_slot("property.amenities.summary", amenities_summary, 0.65)

    property_name = _extract_property_name(html, url)
    path = (urlparse(url).path or "/").lower()
    likely_property_page = not any(
        token in path
        for token in ("faq", "amenit", "gallery", "offers", "dining", "contact", "rooms", "location")
    )
    if property_name and likely_property_page:
        set_slot("property.name", property_name, 0.6)

    return extracted
