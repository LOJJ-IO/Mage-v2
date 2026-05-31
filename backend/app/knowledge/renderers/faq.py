"""Render property_facts into FAQ definitions for keyword matching."""
from __future__ import annotations

import re
from typing import Any, Callable, Set

from app.knowledge.schema_loader import get_slots


def _alias_matcher(aliases: list[str]) -> Callable[[str, Set[str]], bool]:
    alias_set = {a.lower() for a in aliases}

    def _match(message_lower: str, words: Set[str]) -> bool:
        if words & alias_set:
            return True
        return any(a in message_lower for a in alias_set)

    return _match


def _body_for_slot(slot: dict, fact: dict[str, Any] | None) -> str | None:
    if not fact:
        return None
    status = fact.get("status", "unknown")
    if status == "unknown":
        return None
    if status == "not_applicable":
        return None
    val = fact.get("value")
    if val is None:
        return None
    label = slot.get("label", slot["key"])
    if isinstance(val, bool):
        val_str = "available" if val else "not available"
        return f"{label}: {val_str}. Contact the front desk for details."
    if status == "conflict":
        return (
            f"We have conflicting information about {label.lower()}. "
            "Please check with the front desk for the latest details."
        )
    return f"{label}: {val}. Let me know if you need anything else!"


def render_faq_definitions(
    facts: dict[str, dict[str, Any]],
    *,
    schema_version: str = "v1",
) -> list[dict[str, Any]]:
    """
    Return FAQ dicts: id, title, body, aliases (for matcher rebuild).
    One FAQ per faq_id (first slot with body wins).
    """
    slots = get_slots(schema_version)
    by_faq: dict[str, dict[str, Any]] = {}

    for slot in slots:
        faq_id = slot.get("faq_id")
        if not faq_id:
            continue
        if faq_id in by_faq:
            continue
        body = _body_for_slot(slot, facts.get(slot["key"]))
        if not body:
            continue
        aliases = list(slot.get("aliases") or [])
        by_faq[faq_id] = {
            "id": faq_id,
            "title": slot.get("label", faq_id.replace("_", " ").title()),
            "body": body,
            "aliases": aliases,
            "_matcher": _alias_matcher(aliases) if aliases else lambda _ml, _w: False,
        }

    return list(by_faq.values())
