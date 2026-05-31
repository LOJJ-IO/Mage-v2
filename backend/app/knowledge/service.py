"""Knowledge publish and snapshot helpers."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from app.knowledge.renderers.faq import render_faq_definitions
from app.knowledge.renderers.markdown import render_markdown
from app.knowledge.renderers.tree import render_help_desk_tree
from app.knowledge.schema_loader import get_slots, tier_keys
from app.services.database import get_database


def compute_completeness(
    facts: dict[str, dict[str, Any]],
    *,
    schema_version: str = "v1",
) -> dict[str, Any]:
    """Tier A/B completeness percentages."""
    result: dict[str, Any] = {}
    for tier in ("A", "B"):
        keys = tier_keys(tier, schema_version)
        if not keys:
            result[tier] = {"filled": 0, "total": 0, "percent": 100.0}
            continue
        filled = sum(
            1
            for k in keys
            if facts.get(k, {}).get("status") in ("filled", "verified", "not_applicable")
        )
        result[tier] = {
            "filled": filled,
            "total": len(keys),
            "percent": round(100.0 * filled / len(keys), 1),
        }
    return result


def publish_snapshot(
    property_id: str,
    *,
    published_by: str = "staff",
    schema_version: str = "v1",
) -> dict[str, Any]:
    """Render artifacts from current facts and persist snapshot."""
    db = get_database()
    prop = db.get_property(property_id)
    if not prop:
        raise ValueError(f"Unknown property: {property_id}")

    facts = db.list_property_facts(property_id)
    facts_map = {f["slot_key"]: f for f in facts}

    markdown = render_markdown(
        facts_map,
        property_name=prop.name,
        schema_version=schema_version,
    )
    tree = render_help_desk_tree(facts_map, schema_version=schema_version)
    faqs = render_faq_definitions(facts_map, schema_version=schema_version)
    for faq in faqs:
        faq.pop("_matcher", None)

    snapshot_id = f"snap-{uuid.uuid4().hex[:12]}"
    snapshot = db.create_knowledge_snapshot(
        snapshot_id=snapshot_id,
        property_id=property_id,
        schema_version=schema_version,
        markdown=markdown,
        tree_json=tree,
        faq_json=faqs,
        facts_json=facts_map,
        published_by=published_by,
    )
    db.set_property_published_snapshot(property_id, snapshot_id)
    db.update_property_knowledge_mode(property_id, "published_snapshot")
    return snapshot


def get_runtime_knowledge(property_id: str) -> Optional[str]:
    """Load markdown for LLM — snapshot or None (caller falls back to file)."""
    db = get_database()
    prop = db.get_property(property_id)
    if not prop or prop.knowledge_mode != "published_snapshot":
        return None
    if not prop.published_snapshot_id:
        return None
    snap = db.get_knowledge_snapshot(prop.published_snapshot_id)
    if not snap:
        return None
    return snap.get("markdown") or ""


def get_runtime_faqs(property_id: str) -> Optional[list[dict[str, Any]]]:
    db = get_database()
    prop = db.get_property(property_id)
    if not prop or prop.knowledge_mode != "published_snapshot" or not prop.published_snapshot_id:
        return None
    snap = db.get_knowledge_snapshot(prop.published_snapshot_id)
    if not snap:
        return None
    return snap.get("faq_json")


def get_runtime_tree(property_id: str) -> Optional[list[dict[str, Any]]]:
    db = get_database()
    prop = db.get_property(property_id)
    if not prop or prop.knowledge_mode != "published_snapshot" or not prop.published_snapshot_id:
        return None
    snap = db.get_knowledge_snapshot(prop.published_snapshot_id)
    if not snap:
        return None
    return snap.get("tree_json")


def seed_grand_horizon_facts(property_id: str = "grand-horizon") -> None:
    """Seed facts that reproduce Grand Horizon demo content."""
    db = get_database()
    seeds = {
        "property.name": ("The Grand Horizon Hotel", "verified"),
        "property.location": ("Edmonton, Alberta, Canada", "verified"),
        "property.check_in.time": ("3:00 PM", "verified"),
        "property.check_out.time": ("11:00 AM", "verified"),
        "property.check_out.late_policy": ("Available upon request until 1:00 PM ($50 fee)", "verified"),
        "connectivity.wifi.network_name": ("HorizonGuest", "verified"),
        "connectivity.wifi.password": ("StayWithHorizon", "verified"),
        "dining.restaurant.hours": ("Open daily 6:30 AM – 10:30 PM", "verified"),
        "dining.breakfast.hours": ("Breakfast buffet until 10:30 AM", "verified"),
        "dining.bar.hours": ("The Zenith Lounge: 4:00 PM – 1:00 AM", "verified"),
        "dining.room_service.available": (True, "verified"),
        "dining.room_service.hours": ("Available 24/7 — dial 0", "verified"),
        "amenities.pool.hours": ("6:00 AM – 10:00 PM", "verified"),
        "amenities.pool.location": ("3rd floor", "verified"),
        "amenities.fitness.hours": ("6:00 AM – 10:00 PM", "verified"),
        "amenities.fitness.location": ("3rd floor", "verified"),
        "parking.self.available": (True, "verified"),
        "parking.self.location": ("Garage on level B1", "verified"),
        "parking.valet.available": (True, "verified"),
        "room.supplies.iron_board.availability": (
            "In closet; dial 0 if missing",
            "verified",
        ),
        "property.front_desk.phone": ("Dial 0 from room phone", "verified"),
    }
    for key, (value, status) in seeds.items():
        db.upsert_property_fact(
            property_id=property_id,
            slot_key=key,
            value=value,
            status=status,
            updated_by="seed",
        )
