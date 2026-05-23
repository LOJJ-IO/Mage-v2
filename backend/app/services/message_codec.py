"""Serialize and parse structured chat messages stored in conversation content."""
import json
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

from app.models.schemas import FaqItem, Message, MessageKind, MessageRole


def encode_faq_payload(
    intro: str,
    faq_items: List[Dict[str, str]],
    trigger_content: str,
    faq_resolved: Optional[bool] = None,
) -> str:
    return json.dumps(
        {
            "_mage": "faq",
            "intro": intro,
            "items": faq_items,
            "trigger_content": trigger_content,
            "faq_resolved": faq_resolved,
        },
        ensure_ascii=False,
    )


def parse_stored_message(
    role: str,
    content: str,
    message_id: Optional[str] = None,
    timestamp: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Parse DB row into API message fields."""
    ts = timestamp or datetime.utcnow()
    mid = message_id or f"msg-{uuid4().hex[:8]}"
    base: Dict[str, Any] = {
        "id": mid,
        "role": role,
        "content": content or "",
        "timestamp": ts,
        "kind": MessageKind.TEXT.value,
    }
    if role != "assistant":
        return base
    stripped = (content or "").strip()
    if not stripped.startswith("{"):
        return base
    try:
        data = json.loads(stripped)
    except json.JSONDecodeError:
        return base
    if not isinstance(data, dict) or data.get("_mage") != "faq":
        return base
    items = [
        FaqItem(id=item["id"], title=item["title"], body=item["body"])
        for item in data.get("items") or []
        if isinstance(item, dict) and item.get("id")
    ]
    base["kind"] = MessageKind.FAQ.value
    base["intro"] = data.get("intro") or ""
    base["content"] = base["intro"]
    base["faq_items"] = items
    base["trigger_content"] = data.get("trigger_content") or ""
    base["faq_resolved"] = data.get("faq_resolved")
    return base


def segment_to_message_fields(segment: Dict[str, Any], msg_id: str) -> Dict[str, Any]:
    """Map llm_service segment dict to Message constructor kwargs."""
    kind = segment.get("kind", MessageKind.TEXT.value)
    fields: Dict[str, Any] = {
        "id": msg_id,
        "role": MessageRole.ASSISTANT,
        "content": segment.get("content") or "",
        "kind": MessageKind(kind) if kind in MessageKind.__members__.values() else MessageKind.TEXT,
        "require_contact_confirmation": segment.get("require_contact_confirmation", False),
    }
    if fields["kind"] == MessageKind.FAQ:
        fields["intro"] = segment.get("intro")
        fields["faq_items"] = [
            FaqItem(**item) if isinstance(item, dict) else item
            for item in (segment.get("faq_items") or [])
        ]
        fields["trigger_content"] = segment.get("trigger_content")
        fields["faq_resolved"] = segment.get("faq_resolved")
    return fields
