"""Render property_facts into markdown for LLM context."""
from __future__ import annotations

from collections import defaultdict
from typing import Any

from app.knowledge.schema_loader import get_slots, slot_by_key


def _display_value(fact: dict[str, Any] | None) -> str | None:
    if not fact:
        return None
    status = fact.get("status", "unknown")
    if status in ("unknown", "not_applicable"):
        return None
    if status == "conflict":
        val = fact.get("value")
        return f"[CONFLICT — verify with front desk] {val}" if val else None
    val = fact.get("value")
    if val is None:
        return None
    if isinstance(val, bool):
        return "Yes" if val else "No"
    return str(val)


def render_markdown(
    facts: dict[str, dict[str, Any]],
    *,
    property_name: str | None = None,
    schema_version: str = "v1",
) -> str:
    """Build hotel knowledge markdown from canonical facts."""
    slots = get_slots(schema_version)
    sections: dict[str, list[str]] = defaultdict(list)

    if property_name:
        sections["Overview"].append(f"# {property_name}")

    for slot in slots:
        key = slot["key"]
        fact = facts.get(key)
        text = _display_value(fact)
        if not text:
            continue
        section = slot.get("markdown_section") or slot.get("domain", "General")
        label = slot.get("label", key)
        sections[section].append(f"- **{label}:** {text}")

    parts: list[str] = []
    for section, lines in sections.items():
        if section == "Overview" and lines and lines[0].startswith("#"):
            parts.append(lines[0])
            if len(lines) > 1:
                parts.append("")
                parts.extend(lines[1:])
        else:
            parts.append(f"## {section}")
            parts.append("")
            parts.extend(lines)
        parts.append("")

    return "\n".join(parts).strip()
