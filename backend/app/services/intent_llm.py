"""JSON ability classifier for two-layer guest chat routing."""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

import httpx

from app.core.config import get_settings
from app.services.conversation_helpers import trim_history
from app.services.faq_intents import _words as faq_words, is_task_request
from app.services.service_routing import is_in_room_issue

settings = get_settings()
logger = logging.getLogger(__name__)

VALID_SERVICES = frozenset({
    "MAINTENANCE",
    "ROOM_SERVICE",
    "HOUSEKEEPING",
    "CONTACT_FRONT_DESK",
})
VALID_REQUEST_TYPES = frozenset({
    "new",
    "follow_up_escalation",
    "status_check",
    "repetition",
    "social",
})

VALID_ABILITY_CODES = frozenset({"A", "B", "C", "D", "E", "F", "G"})

_THINKING_MODEL_MARKERS = ("thinking", "reason", "ring-", "r1", "deepseek-r1")
_OPENROUTER_BROAD_ROUTERS = frozenset({"openrouter/free", "openrouter/auto"})
_SALVAGE_CONFIDENCE_FLOOR = 0.5
_CACHE_UNSUPPORTED_LOGGED = False

# Inline fallback when classifier_prompt_path is unset or unreadable.
CLASSIFIER_SYSTEM_PROMPT_TEMPLATE = """You are the routing brain for {hotel_name} guest chat.
Walk this decision tree. Output only one JSON object. No markdown.

Select abilities A–F as needed. Do NOT emit an "intent" field in JSON.
Classify ONLY the guest's latest message using history for context only.

OUTPUT schema:
{{"abilities":["A"],"tasks":[{{"service":"HOUSEKEEPING","title":"..."}}],
"info_source":null,"request_type":"new","confidence":0.9,"message":"..."}}"""


def _load_classifier_system_prompt() -> str:
    """Load and compile classifier system prompt once at startup."""
    hotel_name = settings.hotel_name or "the hotel"
    prompt_path = (getattr(settings, "classifier_prompt_path", "") or "").strip()
    if prompt_path:
        try:
            p = Path(prompt_path)
            if not p.is_absolute():
                p = Path(__file__).resolve().parent.parent.parent / prompt_path
            template = p.read_text(encoding="utf-8").strip()
            return template.format(hotel_name=hotel_name)
        except Exception as e:
            logger.warning("Could not load classifier prompt from file: %s", e)
    return CLASSIFIER_SYSTEM_PROMPT_TEMPLATE.format(hotel_name=hotel_name)


CLASSIFIER_SYSTEM_PROMPT: str = _load_classifier_system_prompt()


def get_classifier_system_prompt() -> str:
    return CLASSIFIER_SYSTEM_PROMPT


@dataclass
class ClassifierResult:
    confidence: float
    raw: str
    abilities: List[str] = field(default_factory=list)
    tasks: List[Dict[str, str]] = field(default_factory=list)
    request_type: str = "new"
    message: str = ""
    info_source: Optional[str] = None
    salvaged: bool = False

    @property
    def service(self) -> Optional[str]:
        return self.tasks[0]["service"] if self.tasks else None

    @property
    def title(self) -> Optional[str]:
        return self.tasks[0].get("title") if self.tasks else None

    @property
    def secondary_service(self) -> Optional[str]:
        return self.tasks[1]["service"] if len(self.tasks) > 1 else None

    @property
    def secondary_title(self) -> Optional[str]:
        return self.tasks[1].get("title") if len(self.tasks) > 1 else None


class ClassifierError(Exception):
    """Classifier could not produce valid JSON after retries."""


def _disqualified_classifier_patterns() -> List[str]:
    raw = (getattr(settings, "llm_classifier_disqualified_models", "") or "").strip()
    return [p.strip().lower() for p in raw.split(",") if p.strip()]


def is_disqualified_classifier_model(model_id: str) -> bool:
    lower = (model_id or "").lower()
    return any(pat in lower for pat in _disqualified_classifier_patterns())


def _is_thinking_model_id(model_id: str) -> bool:
    lower = (model_id or "").lower()
    return any(m in lower for m in _THINKING_MODEL_MARKERS)


def _parse_model_tier(env_value: str, default: str) -> List[str]:
    raw = (env_value or default).strip()
    return [m.strip() for m in raw.split(",") if m.strip()]


def models_for_classifier() -> List[str]:
    """Classifier tier: pinned model first, then configured list."""
    pinned = (getattr(settings, "llm_model_classifier", "") or "").strip()
    primary_list = _parse_model_tier(
        getattr(settings, "llm_classifier_models", ""),
        "openrouter/free,openrouter/auto",
    )
    if pinned:
        primary_list = [pinned] + [m for m in primary_list if m != pinned]
    if (settings.llm_auto_allowed_models or "").strip():
        auto_first = [m for m in primary_list if m == "openrouter/auto"]
        free_rest = [m for m in primary_list if m != "openrouter/auto"]
        primary_list = auto_first + free_rest
    fallbacks = [m.strip() for m in (settings.llm_model_fallbacks or "").split(",") if m.strip()]
    candidates: List[str] = []
    seen: set[str] = set()
    for m in primary_list + fallbacks:
        if m and m not in seen:
            seen.add(m)
            candidates.append(m)
    out: List[str] = []
    for m in candidates:
        if is_disqualified_classifier_model(m):
            continue
        if _is_thinking_model_id(m) and len(candidates) > 1:
            continue
        out.append(m)
    return out if out else [c for c in candidates if not is_disqualified_classifier_model(c)][:1]


def _model_supports_prompt_cache(model: str) -> bool:
    lower = (model or "").lower()
    if lower in _OPENROUTER_BROAD_ROUTERS:
        return False
    return True


def _build_system_message_content(model: str) -> Union[str, List[Dict[str, Any]]]:
    use_cache = getattr(settings, "llm_classifier_prompt_cache", False)
    if use_cache and _model_supports_prompt_cache(model):
        return [
            {
                "type": "text",
                "text": CLASSIFIER_SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral", "ttl": "1h"},
            }
        ]
    global _CACHE_UNSUPPORTED_LOGGED
    if use_cache and not _model_supports_prompt_cache(model) and not _CACHE_UNSUPPORTED_LOGGED:
        logger.debug(
            "Prompt cache skipped for model %s (not supported on openrouter/free|auto)",
            model,
        )
        _CACHE_UNSUPPORTED_LOGGED = True
    return CLASSIFIER_SYSTEM_PROMPT


def _task_like_message(user_message: str) -> bool:
    msg = (user_message or "").strip()
    if not msg:
        return False
    lower = msg.lower()
    return is_in_room_issue(msg) or is_task_request(lower, faq_words(lower))


def _resolve_classifier_confidence(
    user_message: str,
    *,
    salvaged: bool,
    model_confidence: Optional[float],
) -> float:
    if salvaged:
        return 0.75 if _task_like_message(user_message) else 0.45
    if model_confidence is None or model_confidence <= 0.0:
        return 0.75 if _task_like_message(user_message) else 0.7
    return max(0.0, min(1.0, model_confidence))


def _normalize_service_value(raw: Any) -> Optional[str]:
    if raw is None or str(raw).lower() == "null":
        return None
    svc = str(raw).upper().strip()
    if "|" in svc:
        svc = svc.split("|")[0].strip()
    return svc if svc in VALID_SERVICES else None


def _normalize_request_type(raw: Any, abilities: List[str]) -> str:
    if abilities == ["G"] or (len(abilities) == 1 and abilities[0] == "G"):
        rt = str(raw or "social").lower().strip()
        return rt if rt in VALID_REQUEST_TYPES else "social"
    if "D" not in abilities:
        rt = str(raw or "status_check").lower().strip()
        return rt if rt in VALID_REQUEST_TYPES else "status_check"
    rt = str(raw or "new").lower().strip()
    return rt if rt in VALID_REQUEST_TYPES else "new"


def _parse_abilities(raw: Any) -> List[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        out: List[str] = []
        for a in raw:
            code = str(a).strip().upper()
            if code in VALID_ABILITY_CODES:
                out.append(code)
            elif len(code) == 1 and code in VALID_ABILITY_CODES:
                out.append(code)
        return out
    if isinstance(raw, str):
        return [c for c in re.findall(r"[A-G]", raw.upper()) if c in VALID_ABILITY_CODES]
    return []


def _optional_str_field(raw: Any, *, max_len: int = 200) -> Optional[str]:
    if raw is None or str(raw).lower() in ("null", ""):
        return None
    return str(raw).strip()[:max_len] or None


def _parse_tasks(data: Dict[str, Any], abilities: List[str]) -> List[Dict[str, str]]:
    tasks: List[Dict[str, str]] = []
    raw = data.get("tasks")
    if isinstance(raw, list):
        for item in raw:
            if not isinstance(item, dict):
                continue
            svc = _normalize_service_value(item.get("service"))
            title = _optional_str_field(item.get("title"), max_len=120)
            if svc and title:
                tasks.append({"service": svc, "title": title})
    legacy_service = _normalize_service_value(data.get("service"))
    if not tasks and (legacy_service or "D" in abilities):
        title = _optional_str_field(data.get("title"))
        if legacy_service:
            tasks.append({"service": legacy_service, "title": title or "Guest request"})
        sec = _normalize_service_value(data.get("secondary_service"))
        sec_title = _optional_str_field(data.get("secondary_title"))
        if sec:
            tasks.append({"service": sec, "title": sec_title or "Additional request"})
    return tasks


def _extract_json_blob(text: str) -> str:
    raw = (text or "").strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.I)
        raw = re.sub(r"\s*```\s*$", "", raw)
    start = raw.find("{")
    end = raw.rfind("}")
    if start >= 0 and end > start:
        return raw[start : end + 1]
    return raw


def _salvage_abilities_from_text(text: str) -> List[str]:
    m = re.search(r'"abilities"\s*:\s*\[([^\]]*)\]', text, re.I)
    if m:
        return _parse_abilities("[" + m.group(1) + "]")
    return _parse_abilities(text)


def _salvage_tasks_from_text(text: str, abilities: List[str]) -> List[Dict[str, str]]:
    tasks: List[Dict[str, str]] = []
    for svc_m, title_m in re.findall(
        r'"service"\s*:\s*"(MAINTENANCE|ROOM_SERVICE|HOUSEKEEPING|CONTACT_FRONT_DESK)"'
        r'[^}]*"title"\s*:\s*"([^"]*)"',
        text,
        re.I,
    ):
        svc = svc_m.upper()
        title = title_m.strip()
        if svc in VALID_SERVICES and title:
            tasks.append({"service": svc, "title": title})
    if tasks:
        return tasks
    service_m = re.search(
        r'"service"\s*:\s*"(MAINTENANCE|ROOM_SERVICE|HOUSEKEEPING|CONTACT_FRONT_DESK|null)"',
        text,
        re.I,
    )
    service: Optional[str] = None
    if service_m:
        svc = service_m.group(1).upper()
        if svc != "NULL":
            service = svc if svc in VALID_SERVICES else None
    sec_m = re.search(
        r'"secondary_service"\s*:\s*"(MAINTENANCE|ROOM_SERVICE|HOUSEKEEPING|CONTACT_FRONT_DESK|null)"',
        text,
        re.I,
    )
    secondary_service: Optional[str] = None
    if sec_m:
        svc = sec_m.group(1).upper()
        if svc != "NULL":
            secondary_service = svc if svc in VALID_SERVICES else None
    title_m = re.search(r'"title"\s*:\s*"([^"]*)"', text)
    title = title_m.group(1).strip() if title_m and title_m.group(1).strip() else None
    sec_title_m = re.search(r'"secondary_title"\s*:\s*"([^"]*)"', text)
    secondary_title = (
        sec_title_m.group(1).strip() if sec_title_m and sec_title_m.group(1).strip() else None
    )
    legacy_data: Dict[str, Any] = {
        "service": service,
        "secondary_service": secondary_service,
        "title": title,
        "secondary_title": secondary_title,
    }
    return _parse_tasks(legacy_data, abilities)


def parse_classifier_json(
    text: str,
    *,
    salvaged: bool = False,
    user_message: str = "",
) -> Optional[ClassifierResult]:
    """Parse classifier output: full JSON, then regex field extraction."""
    blob = _extract_json_blob(text)
    if blob:
        try:
            data = json.loads(blob)
            if isinstance(data, dict):
                return _normalize_classifier_dict(
                    data, text, salvaged=salvaged, user_message=user_message
                )
        except json.JSONDecodeError:
            pass
    if '"abilities"' not in text and '"confidence"' not in text:
        return None
    abilities = _salvage_abilities_from_text(text)
    conf_m = re.search(r'"confidence"\s*:\s*([\d.]+)', text)
    model_conf: Optional[float] = float(conf_m.group(1)) if conf_m else None
    confidence = _resolve_classifier_confidence(
        user_message, salvaged=True, model_confidence=model_conf
    )
    msg_m = re.search(r'"message"\s*:\s*"([^"]*)"', text)
    message = msg_m.group(1).strip() if msg_m and msg_m.group(1).strip() else ""
    rt_m = re.search(
        r'"request_type"\s*:\s*"(new|follow_up_escalation|status_check|repetition|social)"',
        text,
        re.I,
    )
    request_type = _normalize_request_type(
        rt_m.group(1) if rt_m else None, abilities
    )
    info_m = re.search(r'"info_source"\s*:\s*"([^"]*)"', text, re.I)
    info_source = _optional_str_field(info_m.group(1) if info_m else None, max_len=32)
    tasks = _salvage_tasks_from_text(text, abilities)
    return ClassifierResult(
        abilities=abilities,
        tasks=tasks,
        confidence=confidence,
        raw=text,
        salvaged=True,
        message=message,
        request_type=request_type,
        info_source=info_source,
    )


def _infer_abilities_from_legacy(data: Dict[str, Any]) -> List[str]:
    """Map legacy intent/service fields to abilities when abilities omitted."""
    abilities = _parse_abilities(data.get("abilities"))
    if abilities or "abilities" in data:
        return abilities
    legacy_intent = str(data.get("intent", "")).upper().strip()
    if "|" in legacy_intent:
        legacy_intent = legacy_intent.split("|")[0].strip()
    if legacy_intent in ("TASK", "MULTI_TASK", "TASK_AND_INFO"):
        return ["D"]
    if legacy_intent == "INFO":
        return ["E"]
    if legacy_intent == "UTILITY":
        return ["B"]
    if _normalize_service_value(data.get("service")):
        return ["D"]
    return []


def _normalize_classifier_dict(
    data: Dict[str, Any],
    raw: str,
    *,
    salvaged: bool,
    user_message: str = "",
) -> Optional[ClassifierResult]:
    if "abilities" not in data and "confidence" not in data and "intent" not in data:
        return None
    abilities = _infer_abilities_from_legacy(data)
    tasks = _parse_tasks(data, abilities)
    model_conf: Optional[float]
    try:
        conf_val = float(data.get("confidence", 0.7))
        model_conf = None if conf_val <= 0.0 else conf_val
    except (TypeError, ValueError):
        model_conf = None
    confidence = _resolve_classifier_confidence(
        user_message, salvaged=salvaged, model_confidence=model_conf
    )
    msg = _optional_str_field(data.get("message"), max_len=500) or ""
    return ClassifierResult(
        abilities=abilities,
        tasks=tasks,
        confidence=confidence,
        raw=raw,
        salvaged=salvaged,
        message=msg,
        request_type=_normalize_request_type(data.get("request_type"), abilities),
        info_source=_optional_str_field(data.get("info_source"), max_len=32),
    )


def format_classifier_routing_json(result: ClassifierResult) -> str:
    """Compact routing payload for the copy writer."""
    payload: Dict[str, Any] = {
        "abilities": result.abilities,
        "confidence": round(max(0.0, min(1.0, result.confidence)), 3),
        "request_type": result.request_type,
    }
    if result.tasks:
        payload["tasks"] = result.tasks
    if result.info_source:
        payload["info_source"] = result.info_source
    if result.message:
        payload["message"] = result.message
    return json.dumps(payload, separators=(",", ":"))


def build_copy_writer_user_content(
    *,
    routing_json: str,
    user_message: str,
    conversation_gist: str = "",
) -> str:
    parts = [
        "Routing from classifier (ground truth — do not re-classify):",
        routing_json,
        "",
        "Guest message to respond to:",
        (user_message or "").strip(),
    ]
    gist = (conversation_gist or "").strip()
    latest = (user_message or "").strip()
    if gist and gist.lower() != latest.lower():
        parts.extend(["", "Brief thread context:", gist[:500]])
    return "\n".join(parts)


def build_classifier_messages(
    user_message: str,
    conversation_history: Optional[List[Dict[str, str]]] = None,
    *,
    model: str = "",
) -> List[Dict[str, Any]]:
    n = max(1, int(getattr(settings, "llm_classifier_history_turns", 2)))
    history = trim_history(conversation_history)[-n:] if conversation_history else []
    messages: List[Dict[str, Any]] = [
        {"role": "system", "content": _build_system_message_content(model)},
    ]
    for row in history:
        role = row.get("role", "user")
        if role in ("user", "assistant"):
            content = (row.get("content") or "").strip()
            if content:
                messages.append({"role": role, "content": content[:500]})
    messages.append({"role": "user", "content": user_message})
    return messages


def _build_classifier_request_body(model: str, messages: List[Dict[str, Any]]) -> Dict[str, Any]:
    body: Dict[str, Any] = {
        "model": model,
        "messages": messages,
        "max_tokens": int(getattr(settings, "llm_max_tokens_classifier", 380)),
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
    }
    if model in _OPENROUTER_BROAD_ROUTERS and (settings.llm_auto_allowed_models or "").strip():
        patterns = [p.strip() for p in settings.llm_auto_allowed_models.split(",") if p.strip()]
        if patterns:
            body["plugins"] = [{"id": "auto-router", "allowed_models": patterns}]
    return body


def _copy_classifier_result(parsed: ClassifierResult, **updates: Any) -> ClassifierResult:
    return ClassifierResult(
        confidence=updates.get("confidence", parsed.confidence),
        raw=updates.get("raw", parsed.raw),
        abilities=updates.get("abilities", parsed.abilities),
        tasks=updates.get("tasks", parsed.tasks),
        request_type=updates.get("request_type", parsed.request_type),
        message=updates.get("message", parsed.message),
        salvaged=updates.get("salvaged", parsed.salvaged),
        info_source=updates.get("info_source", parsed.info_source),
    )


async def call_classifier(
    user_message: str,
    conversation_history: Optional[List[Dict[str, str]]] = None,
    *,
    api_key: Optional[str] = None,
) -> ClassifierResult:
    key = (api_key or settings.openrouter_api_key or "").strip()
    if not key:
        raise ClassifierError("OPENROUTER_API_KEY is not set")

    models = models_for_classifier()
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://mage-hotel.app",
        "X-Title": "Mage Hotel Assistant",
    }
    last_raw = ""
    for model in models:
        messages = build_classifier_messages(
            user_message, conversation_history, model=model
        )
        try:
            async with httpx.AsyncClient(timeout=float(settings.llm_request_timeout_small)) as client:
                response = await client.post(
                    f"{settings.openrouter_base_url}/chat/completions",
                    headers=headers,
                    json=_build_classifier_request_body(model, messages),
                )
                response.raise_for_status()
                data = response.json()
                resolved_model = (data.get("model") or model) or ""
                if is_disqualified_classifier_model(resolved_model):
                    logger.warning(
                        "Classifier resolved to disqualified model %s; trying next.",
                        resolved_model,
                    )
                    last_raw = (data["choices"][0].get("message", {}).get("content") or "").strip()
                    continue
                choice = data["choices"][0]
                raw = (choice.get("message", {}).get("content") or "").strip()
                last_raw = raw
                finish = choice.get("finish_reason") or ""
                parsed = parse_classifier_json(raw, salvaged=False, user_message=user_message)
                if parsed:
                    if finish == "length":
                        parsed = _copy_classifier_result(
                            parsed,
                            confidence=max(parsed.confidence, _SALVAGE_CONFIDENCE_FLOOR),
                            salvaged=True,
                            raw=raw,
                        )
                    return parsed
                salvaged = parse_classifier_json(
                    raw, salvaged=True, user_message=user_message
                )
                if salvaged:
                    logger.warning(
                        "Classifier %s: salvaged JSON (finish=%s)",
                        resolved_model,
                        finish,
                    )
                    return salvaged
                logger.warning(
                    "Classifier %s: unparseable (finish=%s); trying next.",
                    resolved_model,
                    finish,
                )
        except httpx.HTTPStatusError as e:
            logger.warning(
                "Classifier model %s failed: %s %s",
                model,
                e.response.status_code,
                (e.response.text or "")[:200],
            )
            continue
        except Exception as e:
            logger.exception("Classifier model %s error: %s", model, e)
            continue

    if last_raw:
        salvaged = parse_classifier_json(
            last_raw, salvaged=True, user_message=user_message
        )
        if salvaged:
            return salvaged
    raise ClassifierError("Could not obtain valid classifier JSON from any model")
