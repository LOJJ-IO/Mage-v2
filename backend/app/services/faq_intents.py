"""FAQ keyword matching, task-request detection, and intro copy."""
import json
import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Callable, Dict, List, Optional, Set

FAQ_COOLDOWN_MINUTES = 10

SPECIFIC_INFO_PATTERNS = (
    r"\bwhen\b",
    r"\bwhat time\b",
    r"\bwhat hour",
    r"\bclosing\b",
    r"\bclose\b",
    r"\bhours?\b",
    r"\bhow late\b",
    r"\bhow early\b",
    r"\bwho\b",
    r"\bstaff\b",
    r"\bemployee\b",
    r"\bhow much\b",
    r"\bprice\b",
    r"\bcost\b",
)
TIME_OR_DEFERRAL_IN_BODY = re.compile(
    r"\b\d{1,2}\s*(?:am|pm)\b|\d{1,2}:\d{2}|"
    r"\bopen\b|\bclose|\bhours?\b|dial\s*0|front desk",
    re.I,
)

FAQ_INTRO_VARIANTS = [
    "First, I'll check a few FAQs that often cover this.",
    "Let me pull up the most relevant quick answers for you.",
    "I'll start with our common answers for questions like this.",
    "See if any of these help — if not, I can take it from here.",
    "Let me know if any of these answer it; I'm happy to help further.",
    "These cover the usual cases — tell me if you need something more specific.",
    "I'll try the quick answers first; I can still help with requests and room needs.",
    "For simple questions, these FAQs usually do the trick. For anything else, just say so.",
]

CLOSING_PHRASES = frozenset(
    {
        "no",
        "nope",
        "nah",
        "n",
        "no thanks",
        "no thank you",
        "that's all",
        "thats all",
        "that is all",
        "all set",
        "all good",
        "i'm good",
        "im good",
        "nothing else",
        "no that's all",
        "no thats all",
        "no that's all for now",
        "no thats all for now",
    }
)

SHORT_ACK_WORDS = frozenset({"ok", "okay", "i see", "got it", "understood", "alright", "yes", "yep", "yeah"})

TASK_REQUEST_PATTERNS = (
    r"\b(?:i\s+)?need\b",
    r"\bplease\b",
    r"\b(?:can|could)\s+(?:i|we)\s+get\b",
    r"\b(?:send|bring|deliver)\b",
    r"\b(?:request|order)\b",
    r"\b(?:broken|not\s+working|doesn'?t\s+work)\b",
    r"\b(?:asap|right\s+away|immediately)\b",
    r"\b(?:in\s+the\s+)?next\s+\d+\s+minutes?\b",
    r"\btonight\b",
    r"\b(?:haven'?t|have\s+not)\s+heard\b",
    r"\bstill\s+waiting\b",
    r"\bfix\b",
    r"\brepair\b",
    r"\bextra\s+(?:towel|pillow|blanket)\b",
    r"\bfresh\s+towel",
    r"\bbaby\s+bed\b",
    r"\bcrib\b",
    r"\bhousekeeping\b.*\b(?:please|need|send)\b",
)


@dataclass(frozen=True)
class FaqDefinition:
    id: str
    title: str
    body: str
    matches: Callable[[str, Set[str]], bool]


def _words(message_lower: str) -> Set[str]:
    return set(re.findall(r"\b\w+\b", message_lower))


def is_task_request(message_lower: str, words: Optional[Set[str]] = None) -> bool:
    """True when the guest is asking for action, not just information."""
    w = words if words is not None else _words(message_lower)
    if any(re.search(p, message_lower) for p in TASK_REQUEST_PATTERNS):
        return True
    if w & {"need", "please", "send", "bring", "deliver", "broken", "fix", "repair"}:
        return True
    if "not" in w and "working" in w:
        return True
    return False


def has_explicit_info_question(message_lower: str) -> bool:
    """Guest is asking for information (FAQ-style), not only requesting fulfillment."""
    info_patterns = (
        r"\bwhat(?:'s| is)\s+the\b",
        r"\bwhere\s+(?:is|are)\b",
        r"\bwhen\s+(?:is|are|does)\b",
        r"\bhow\s+(?:do|can|does)\b",
        r"\bwifi\b",
        r"\bwi-fi\b",
        r"\bpassword\b",
        r"\bhours?\b",
        r"\bcheckout\b",
        r"\bcheck\s+out\b",
        r"\bdo you have\b",
        r"\bare there\b",
        r"\bis there\b",
        r"\bavailable\b",
    )
    return any(re.search(p, message_lower) for p in info_patterns)


def is_fulfillment_request(message_lower: str, words: Optional[Set[str]] = None) -> bool:
    """Guest wants something done (supplies, repair, delivery) — not just asking if it exists."""
    w = words if words is not None else _words(message_lower)
    if not is_task_request(message_lower, w):
        return False
    if has_explicit_info_question(message_lower) and not (
        w & {"send", "bring", "deliver", "need", "get", "order", "fix", "repair"}
    ):
        return False
    supply = {
        "towel", "towels", "pillow", "pillows", "blanket", "blankets", "sheets",
        "housekeeping", "linen", "linens", "amenities",
    }
    if w & {"send", "bring", "deliver", "need", "get", "order"} and (w & supply or "room" in w):
        return True
    if re.search(r"\b(?:send|bring|deliver|get)\b.*\b(?:to\s+)?(?:my\s+)?room\b", message_lower):
        return True
    if w & {"broken", "fix", "repair", "maintenance", "shower", "toilet", "leak"}:
        return True
    if w & {"housekeeping", "clean"} and w & {"please", "need", "send"}:
        return True
    return False


def should_show_faq_with_task(
    message_lower: str,
    words: Set[str],
    faq_matches: List[FaqDefinition],
) -> bool:
    """
    FAQ panel plus task continuation only when the guest mixes an info question
    with a fulfillment request (e.g. towels + Wi‑Fi password). Pure requests
    like 'send towels to my room' go to the task/LLM path only.
    """
    if not faq_matches or not is_task_request(message_lower, words):
        return False
    if is_fulfillment_request(message_lower, words):
        return has_explicit_info_question(message_lower) and (
            " and " in message_lower or len(faq_matches) >= 2
        )
    return False


def pick_faq_intro(guest_id: Optional[str], bundle_key: str) -> str:
    seed = f"{guest_id or 'anon'}:{bundle_key}"
    idx = abs(sum(ord(c) for c in seed)) % len(FAQ_INTRO_VARIANTS)
    return FAQ_INTRO_VARIANTS[idx]


def is_conversation_closing(message_lower: str, words: Set[str]) -> bool:
    if is_fulfillment_request(message_lower, words):
        return False
    if message_lower in CLOSING_PHRASES:
        return True
    if "that's all" in message_lower or "thats all" in message_lower:
        if words & {"need", "send", "get", "order", "bring", "deliver", "want", "only", "just"}:
            return False
        if not re.search(r"(?:that's all|thats all)\s*\.?\s*$", message_lower):
            return False
    if "all set" in message_lower or "all good" in message_lower:
        return True
    if words & {"no", "nope", "nah"} and ("all" in words or "else" in words or "thanks" in words):
        return True
    return False


def is_short_ack(message_lower: str) -> bool:
    return message_lower in SHORT_ACK_WORDS


def _faq_definitions() -> List[FaqDefinition]:
    def wif(words_key):
        def _m(_ml: str, w: Set[str]) -> bool:
            return bool(w & set(words_key))

        return _m

    return [
        FaqDefinition(
            "wifi",
            "Wi‑Fi",
            "The WiFi network is 'HotelGuest' and the password is on the card in your room. Let me know if you have any trouble connecting!",
            wif(["wifi", "internet", "password", "wi-fi"]),
        ),
        FaqDefinition(
            "dining",
            "Dining hours",
            "Our restaurant is open from 6:30 AM to 10:30 PM. Breakfast is served until 10:30 AM in the main dining room on the ground floor.",
            wif(["breakfast", "restaurant", "food", "eat", "eating", "dining"]),
        ),
        FaqDefinition(
            "checkout",
            "Checkout",
            "Checkout is at 11 AM. Would you like a late checkout? I can check availability for you.",
            lambda ml, w: "check out" in ml or "checkout" in ml or bool(w & {"leaving", "leave", "depart"}),
        ),
        FaqDefinition(
            "pool",
            "Pool & fitness",
            "The pool and fitness center are on the 3rd floor, open 6 AM - 10 PM. Towels are provided at the entrance.",
            wif(["pool", "gym", "fitness", "swim"]),
        ),
        FaqDefinition(
            "spa",
            "Spa services",
            "In-room spa massages are available by appointment — please book at least 2 hours ahead. "
            "For spa hours, staff, or scheduling, dial 0 from your room and the front desk can help.",
            wif(["spa"]),
        ),
        FaqDefinition(
            "parking",
            "Parking",
            "Self-parking is available in the garage on level B1. Valet is available at the main entrance. Would you like the current rates?",
            wif(["parking", "park", "car", "valet"]),
        ),
        FaqDefinition(
            "laundry",
            "Laundry",
            "Laundry and dry-cleaning are available. Place items in the bag in your closet and call the front desk for pickup. Same-day service is available for most items.",
            wif(["laundry", "dry", "cleaning", "press"]),
        ),
        FaqDefinition(
            "billing",
            "Billing",
            "For your bill or to dispute a charge, please visit the front desk or dial 0 from your room. They can print a copy or go through line items with you.",
            wif(["bill", "invoice", "charge", "payment", "pay"]),
        ),
        FaqDefinition(
            "pets",
            "Pets",
            "Pets are welcome with a small daily fee. Please let the front desk know so they can note your reservation. Pet amenities are available on request.",
            wif(["pet", "pets", "dog", "cat"]),
        ),
        FaqDefinition(
            "lost_found",
            "Lost & found",
            "For lost items, please contact the front desk or housekeeping. They keep a lost-and-found log and will follow up if something is found.",
            wif(["lost", "left", "forgot", "missing"]),
        ),
        FaqDefinition(
            "towels_info",
            "Extra linens",
            "Extra towels, pillows, or blankets are available through housekeeping. Tell me what you need and I can send a request to your room.",
            lambda ml, w: bool(w & {"towel", "towels", "pillow", "pillows", "blanket", "blankets"})
            and not is_fulfillment_request(ml, w),
        ),
        FaqDefinition(
            "housekeeping_info",
            "Housekeeping",
            "Housekeeping can refresh your room or bring supplies. Tell me what you need and I can route a request for you.",
            lambda ml, w: "housekeeping" in ml or bool(w & {"housekeeper"}),
        ),
        FaqDefinition(
            "elevator",
            "Elevators",
            "Guest elevators are in the lobby and at hallway ends. For accessibility needs, ask the front desk.",
            wif(["elevator", "lift"]),
        ),
        FaqDefinition(
            "transport",
            "Airport & taxis",
            "For airport shuttles or taxis, the front desk can book or share schedules and rates—dial 0 or stop by the lobby.",
            lambda ml, w: "shuttle" in ml or "airport" in ml or "taxi" in ml or bool(w & {"uber", "lyft"}),
        ),
        FaqDefinition(
            "minibar",
            "Minibar",
            "Minibar items are billed separately. If something looks wrong on your bill, ask the front desk to review it.",
            lambda ml, _w: any(p in ml for p in ("minibar", "mini-bar", "mini bar")),
        ),
        FaqDefinition(
            "safe",
            "In-room safe",
            "Safe instructions are in your welcome guide. If you need help opening or resetting it, contact the front desk.",
            lambda ml, _w: any(
                p in ml
                for p in ("room safe", "in-room safe", "in room safe", "hotel safe", "safe box", "open the safe")
            ),
        ),
        FaqDefinition(
            "noise",
            "Noise concerns",
            "I'm sorry for the disturbance. I can note a noise concern or connect you with the front desk to help.",
            wif(["noise", "loud", "noisy"]),
        ),
        FaqDefinition(
            "climate",
            "Room temperature",
            "Try the wall thermostat for room climate. If it's still uncomfortable, dial 0 and maintenance can assist.",
            lambda ml, w: bool(w & {"cold", "hot", "temperature", "thermostat", "heating", "cooling"})
            or "air conditioning" in ml
            or "a/c" in ml,
        ),
        FaqDefinition(
            "bar",
            "Bar & lounge",
            "Bar and lounge hours are posted in the lobby—the front desk can share specials or help with reservations.",
            wif(["bar", "lounge", "cocktail", "wine", "beer"]),
        ),
        FaqDefinition(
            "coffee",
            "Coffee & tea",
            "Coffee and tea are available at breakfast in the dining room; ask the front desk for in-room options if you prefer.",
            lambda ml, w: bool(w & {"coffee", "tea"}) and not (w & {"breakfast", "restaurant", "dining"}),
        ),
        FaqDefinition(
            "upgrade",
            "Room upgrades",
            "Room upgrades depend on availability—ask the front desk and they can check options and rates.",
            wif(["upgrade", "upgrades"]),
        ),
        FaqDefinition(
            "iron",
            "Iron & ironing board",
            "An iron and ironing board are typically in the closet. If yours is missing, dial 0 and housekeeping can bring one.",
            lambda ml, w: "ironing" in ml or bool(w & {"iron"}),
        ),
        FaqDefinition(
            "hair_dryer",
            "Hair dryer",
            "A hair dryer is usually in the bathroom drawer. If it's missing, ask housekeeping or dial 0.",
            lambda ml, _w: any(p in ml for p in ("hair dryer", "hairdryer", "blow dryer")),
        ),
        FaqDefinition(
            "concierge",
            "Concierge & directions",
            "Our concierge can help with maps, directions, and local reservations—visit the front desk or dial 0.",
            lambda ml, w: bool(w & {"concierge", "directions"}) or "nearby" in ml,
        ),
        FaqDefinition(
            "amenities",
            "Hotel amenities",
            "Common amenities include Wi-Fi, fitness, pool, dining, parking, and housekeeping—what would you like details on?",
            wif(["amenities", "amenity"]),
        ),
        FaqDefinition(
            "wake_up",
            "Wake-up call",
            "You can request a wake-up call by dialing 0 from your room phone. The front desk will set it up for you.",
            lambda ml, _w: "wake up" in ml or "wakeup" in ml,
        ),
        FaqDefinition(
            "room_service_info",
            "Room service",
            "For room service, dial 0 on your room phone, or tell me what you'd like and I can help place an order.",
            lambda ml, w: "room service" in ml or ("order" in w and "room" in w),
        ),
    ]


def collect_faq_matches(
    message_lower: str,
    words: Optional[Set[str]] = None,
    *,
    property_id: Optional[str] = None,
) -> List[FaqDefinition]:
    w = words if words is not None else _words(message_lower)
    seen: Set[str] = set()
    matched: List[FaqDefinition] = []
    for faq in get_active_faq_definitions(property_id):
        if faq.id in seen:
            continue
        if faq.matches(message_lower, w):
            seen.add(faq.id)
            matched.append(faq)
    return matched


def get_active_faq_definitions(property_id: Optional[str] = None) -> List[FaqDefinition]:
    """Snapshot FAQs take precedence; fall back to hardcoded Grand Horizon matchers."""
    if property_id:
        try:
            from app.knowledge.service import get_runtime_faqs

            runtime = get_runtime_faqs(property_id)
            if runtime:
                out: List[FaqDefinition] = []
                for row in runtime:
                    aliases = row.get("aliases") or []

                    def _matcher(_ml: str, w: Set[str], _aliases=aliases) -> bool:
                        alias_set = {a.lower() for a in _aliases}
                        return bool(w & alias_set) or any(a in _ml for a in alias_set)

                    out.append(
                        FaqDefinition(
                            id=row["id"],
                            title=row["title"],
                            body=row["body"],
                            matches=_matcher,
                        )
                    )
                return out
        except Exception:
            pass
    return _faq_definitions()


def faq_bundle_key(faqs: List[FaqDefinition]) -> str:
    return ",".join(sorted(f.id for f in faqs))


def _parse_faq_payload(content: str) -> Optional[Dict[str, object]]:
    stripped = (content or "").strip()
    if not stripped.startswith("{"):
        return None
    try:
        data = json.loads(stripped)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict) or data.get("_mage") != "faq":
        return None
    return data


def _faq_ids_from_payload(data: Dict[str, object]) -> str:
    items = data.get("items") or []
    ids = sorted(
        str(item.get("id"))
        for item in items
        if isinstance(item, dict) and item.get("id")
    )
    return ",".join(ids)


def faq_bundle_on_cooldown(
    bundle_key: str,
    conversation_history: Optional[List[Dict[str, str]]],
    *,
    cooldown_minutes: int = FAQ_COOLDOWN_MINUTES,
) -> bool:
    """True if this FAQ bundle was shown recently (guest likely already saw it)."""
    if not bundle_key or not conversation_history:
        return False
    now = datetime.utcnow()
    for msg in reversed(conversation_history):
        if msg.get("role") != "assistant":
            continue
        payload = _parse_faq_payload(str(msg.get("content") or ""))
        if not payload:
            continue
        shown_key = _faq_ids_from_payload(payload)
        if shown_key != bundle_key:
            continue
        created_at = msg.get("created_at")
        if created_at:
            try:
                ts = datetime.fromisoformat(str(created_at).replace("Z", "+00:00"))
                if ts.tzinfo:
                    ts = ts.replace(tzinfo=None) - (ts.utcoffset() or timedelta())
                if now - ts < timedelta(minutes=cooldown_minutes):
                    return True
                continue
            except ValueError:
                pass
        return True
    return False


def faq_plausibly_answers_question(message_lower: str, faq: FaqDefinition) -> bool:
    """Skip FAQs that keyword-match but do not address what the guest asked."""
    asks_specific = any(re.search(p, message_lower) for p in SPECIFIC_INFO_PATTERNS)
    if not asks_specific:
        return True

    body_lower = faq.body.lower()
    title_lower = faq.title.lower()
    combined = f"{title_lower} {body_lower}"

    topic_terms = [
        term
        for term in re.findall(r"\b[a-z]{3,}\b", message_lower)
        if term
        not in {
            "when",
            "what",
            "where",
            "does",
            "close",
            "closing",
            "hours",
            "hour",
            "time",
            "work",
            "works",
            "the",
            "and",
            "who",
            "spa",
        }
    ]
    for term in topic_terms[:4]:
        if term in message_lower and term not in combined:
            return False

    if "spa" in message_lower and "spa" not in combined:
        return False

    if re.search(r"\bwhen\b|\bclose|\bclosing|\bhours?\b", message_lower):
        if not TIME_OR_DEFERRAL_IN_BODY.search(combined):
            return False

    if re.search(r"\bwho\b|\bstaff\b|\bemployee\b", message_lower):
        if not re.search(r"\bstaff|team|desk|dial\s*0|contact", combined):
            return False

    return True


def filter_faqs_for_display(
    message_lower: str,
    matches: List[FaqDefinition],
    conversation_history: Optional[List[Dict[str, str]]] = None,
) -> List[FaqDefinition]:
    """Relevance + cooldown filter before showing FAQ panels."""
    relevant = [f for f in matches if faq_plausibly_answers_question(message_lower, f)]
    if not relevant:
        return []
    bundle = faq_bundle_key(relevant)
    if faq_bundle_on_cooldown(bundle, conversation_history):
        return []
    return relevant
