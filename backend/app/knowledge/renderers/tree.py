"""Render property_facts into staff help-desk tree nodes."""
from __future__ import annotations

from typing import Any

from app.knowledge.schema_loader import get_slots


def render_help_desk_tree(
    facts: dict[str, dict[str, Any]],
    *,
    schema_version: str = "v1",
) -> list[dict[str, Any]]:
    """
    Build hierarchical help desk tree grouped by domain.
    Each leaf includes attribute_key, status, confidence, source_url.
    """
    slots = get_slots(schema_version)
    domains: dict[str, list[dict[str, Any]]] = {}

    for slot in slots:
        key = slot["key"]
        fact = facts.get(key) or {"status": "unknown"}
        status = fact.get("status", "unknown")
        value = fact.get("value")
        label = slot.get("label", key)
        child: dict[str, Any] = {
            "id": key.replace(".", "-"),
            "label": label,
            "attribute_key": key,
            "status": status,
            "confidence": fact.get("confidence"),
            "source_url": fact.get("source_url"),
        }
        if value is not None and status in ("filled", "verified"):
            child["answer"] = str(value) if not isinstance(value, bool) else ("Yes" if value else "No")
        domain = slot.get("domain", "general")
        domains.setdefault(domain, []).append(child)

    tree: list[dict[str, Any]] = []
    for domain, children in sorted(domains.items()):
        tree.append(
            {
                "id": domain,
                "label": domain.replace("_", " ").title(),
                "children": children,
            }
        )
    return tree
